/**
 * crm_consent_log 影子表蓝绿切换 · 阶段二（人工闸口：补增量 + 原子 RENAME）
 *
 * 前置：阶段一已跑通（node scripts/consent-log-shadow-phase1.mjs），且代码侧
 *       auth.repo.recordConsentLog 已停止写 user_key / consent_timestamp / source_page 三列。
 *
 * 运行方式（两个确认位都要显式给，缺一个就直接拒绝）：
 *   node scripts/consent-log-shadow-phase2-cutover.mjs --confirm=phase2-cutover --cross-repo-scanned=done
 *
 * 为什么要有 --cross-repo-scanned：crm 库由 supply-os 与 intelligence-daily 共用。
 *   删列对"仍在按名引用这些列的站外 SQL"是致命的（Unknown column）。切换前必须人工确认
 *   站外仓库没有 SELECT/INSERT/UPDATE 触及 crm_consent_log.user_key / consent_timestamp / source_page。
 *   本仓库能自动扫描，站外仓库扫不到——所以把它做成一道必须由人回答的闸，而不是假装检测。
 *
 * 安全设计：
 *   - 切换前先做"补增量 + 全等校验"，校验不过绝不动表名；
 *   - 全程 SET SESSION lock_wait_timeout=5，拿不到元数据锁立即失败退出，不排队持锁；
 *   - 只做一条原子 RENAME（旧表→__old_<日期>，__new→正式名），旧表整表保留，回滚是一次 RENAME；
 *   - 绝不 DROP 任何表。
 */
import fs from "fs";
import mysql from "mysql2/promise";

const OLD_TABLE = "crm_consent_log";
const NEW_TABLE = "crm_consent_log__new";
const BACKUP_TABLE = "crm_consent_log__old_20260926";

const KEEP_COLUMNS = [
  "id", "user_id", "consent_type", "document_version", "action",
  "ip_address", "user_agent", "created_at",
];
const RETIRED_COLUMNS = ["user_key", "consent_timestamp", "source_page"];
/** auth.repo.recordConsentLog 的 INSERT 列清单（结构必须覆盖它，否则切换即断写） */
const CODE_INSERT_COLUMNS = [
  "user_id", "consent_type", "document_version", "action", "ip_address", "user_agent",
];

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf("=");
    return [a.slice(0, i), a.slice(i + 1)];
  }),
);
if (args["--confirm"] !== "phase2-cutover") {
  console.error("[拒绝执行] 必须显式带 --confirm=phase2-cutover：本脚本会改动生产表名指向。");
  process.exit(1);
}
if (args["--cross-repo-scanned"] !== "done") {
  console.error("[拒绝执行] 必须显式带 --cross-repo-scanned=done：请先人工确认 intelligence-daily 等站外仓库无 SQL 引用 "
    + RETIRED_COLUMNS.join(" / ") + "。");
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => /^DB_[A-Z]+=/ && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/["']/g, "").trim()]),
);

const pool = await mysql.createPool({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, charset: "utf8mb4", connectionLimit: 2,
});
const q = async (sql, args2) => (await pool.query(sql, args2))[0];
const fail = async (msg) => { console.error(`[FATAL] ${msg}`); await pool.end(); process.exit(1); };

const exists = async (t) => (await q(
  `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [t],
))[0].n > 0;
const colsOf = async (t) => (await q(
  `SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
  [t],
)).map((r) => r.c);

// ── 1. 闸口前置检查 ──
if (!(await exists(NEW_TABLE))) await fail(`影子表 ${NEW_TABLE} 不存在——请先跑阶段一并确认其校验全过。`);
if (await exists(BACKUP_TABLE)) await fail(`备份表 ${BACKUP_TABLE} 已存在——说明本脚本可能已跑过一次，或名字撞车；请人工核对后再继续。`);

const newCols = await colsOf(NEW_TABLE);
if (JSON.stringify(newCols) !== JSON.stringify(KEEP_COLUMNS)) {
  await fail(`影子表列集合与目标不一致：期望 [${KEEP_COLUMNS}] 实得 [${newCols}]。请先重跑阶段一。`);
}
for (const c of CODE_INSERT_COLUMNS) {
  if (!newCols.includes(c)) await fail(`代码要写的列 ${c} 在影子表缺失，切换即断写，拒绝执行。`);
}
console.log(`[1] 影子表结构自检通过（${newCols.length} 列，退役列已不在位，代码写入列全覆盖）`);

// 元数据锁与长事务：有人持锁时不排队，直接放弃（避免把切换变成线上等待风暴）
await pool.query("SET SESSION lock_wait_timeout = 5");
const mdlHolders = await q(
  `SELECT COUNT(*) AS n FROM performance_schema.metadata_locks
   WHERE OBJECT_SCHEMA = DATABASE() AND OBJECT_NAME = ? AND LOCK_STATUS = 'GRANTED'`,
  [OLD_TABLE],
);
if (Number(mdlHolders[0].n) > 0) {
  await fail(`旧表 ${OLD_TABLE} 上有 ${mdlHolders[0].n} 个 GRANTED 元数据锁持有者：先停应用/冻结写入方再切，`
    + `否则 RENAME 会等锁（依据 performance_schema.metadata_locks，而不是"进程名看着没有"）。`);
}
const longTrx = await q(
  `SELECT COUNT(*) AS n FROM information_schema.INNODB_TRX WHERE trx_started < NOW() - INTERVAL 30 SECOND`,
);
if (Number(longTrx[0].n) > 0) await fail(`存在 ${longTrx[0].n} 个超过 30 秒的 InnoDB 事务，切换会被它们卡住 MDL，请处理后再跑。`);
// 诚实标注本项的检测边界：metadata_locks 消费者开关在部分实例默认关闭，此时本计数恒为 0，
// 不等于“确实无锁”——不得把它当成已验证无争用，仍须以停应用 + 冻结外部写入为准（ADR-0003 阶段二第 1 步）。
console.log("[2] MDL 与长事务检查通过（GRANTED 持有者 0、长事务 0）；"
  + "注：若实例未开启 performance_schema 的 wait/lock/metadata/sql/mdl 消费者，MDL 一项会是假阴性，冻结窗口不可省略。");

// ── 2. 补增量：阶段一之后旧表新增的行（id 主键不可变，按 id 反连接补全）──
const beforeOld = Number((await q(`SELECT COUNT(*) AS n FROM \`${OLD_TABLE}\``))[0].n);
const beforeNew = Number((await q(`SELECT COUNT(*) AS n FROM \`${NEW_TABLE}\``))[0].n);
const inc = await pool.query(
  `INSERT INTO \`${NEW_TABLE}\` (${KEEP_COLUMNS.map((c) => `\`${c}\``).join(", ")})
   SELECT ${KEEP_COLUMNS.map((c) => `\`${c}\``).join(", ")} FROM \`${OLD_TABLE}\` o
   WHERE NOT EXISTS (SELECT 1 FROM \`${NEW_TABLE}\` n WHERE n.id = o.id)`,
);
const patched = Number(inc[0].affectedRows);
console.log(`[3] 补增量完成：本次新灌 ${patched} 行（旧表 ${beforeOld} 行，影子表 ${beforeNew} → ${beforeNew + patched} 行）`);

// ── 3. 切换前全等校验（不过就绝不动表名）──
let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const oldNow = Number((await q(`SELECT COUNT(*) AS n FROM \`${OLD_TABLE}\``))[0].n);
const newNow = Number((await q(`SELECT COUNT(*) AS n FROM \`${NEW_TABLE}\``))[0].n);
check(oldNow === newNow, "行数一致", `旧 ${oldNow} / 新 ${newNow}`);
for (const col of KEEP_COLUMNS) {
  const mism = Number((await q(
    `SELECT COUNT(*) AS n FROM \`${OLD_TABLE}\` o JOIN \`${NEW_TABLE}\` n ON n.id = o.id WHERE NOT (o.\`${col}\` <=> n.\`${col}\`)`,
  ))[0].n);
  check(mism === 0, `列 ${col} 逐行 NULL-safe 全等`, `不等 ${mism}`);
}
const missing = Number((await q(
  `SELECT COUNT(*) AS n FROM \`${OLD_TABLE}\` o WHERE NOT EXISTS (SELECT 1 FROM \`${NEW_TABLE}\` n WHERE n.id = o.id)`,
))[0].n);
check(missing === 0, "旧表每个 id 均已落到影子表", `缺失 ${missing}`);
if (failures > 0) await fail(`切换前校验 ${failures} 项不符，已停止且未改动任何表名。请排查后重跑本脚本。`);
console.log("[4] 切换前校验全过");

// ── 4. 原子切换（一条 RENAME，两个动作原子生效）──
const swapSql = `RENAME TABLE \`${OLD_TABLE}\` TO \`${BACKUP_TABLE}\`, \`${NEW_TABLE}\` TO \`${OLD_TABLE}\``;
try {
  await pool.query(swapSql);
} catch (err) {
  await fail(`RENAME 失败（多为锁等待超时，表名未被改动）：${err.message}`);
}
console.log(`[5] 已原子切换：${OLD_TABLE} → ${BACKUP_TABLE}（保留），${NEW_TABLE} → ${OLD_TABLE}`);

// ── 5. 切换后回读确认 ──
const liveCols = await colsOf(OLD_TABLE);
check(JSON.stringify(liveCols) === JSON.stringify(KEEP_COLUMNS), "线上表现在的列 = 目标列", `[${liveCols}]`);
check(RETIRED_COLUMNS.every((c) => !liveCols.includes(c)), "线上表已无退役列", RETIRED_COLUMNS.join("/"));
const liveRows = Number((await q(`SELECT COUNT(*) AS n FROM \`${OLD_TABLE}\``))[0].n);
check(liveRows === oldNow, "线上表行数与切换前旧表一致", `${liveRows} vs ${oldNow}`);
const idxLive = (await q(
  `SELECT DISTINCT INDEX_NAME i FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
  [OLD_TABLE],
)).map((r) => r.i).sort();
check(JSON.stringify(idxLive) === JSON.stringify(["PRIMARY", "idx_consent_log_user_id", "idx_consent_type"]),
  "线上表索引集合正确（idx_user_key 已随列消失）", `[${idxLive}]`);
if (failures > 0) await fail("切换后回读有不符项，请立即执行下方回滚命令。");

console.log(`
[6] 切换成功。接下来必须做的三件事：
  a) 立刻验证同意日志真的能写：走一次注册（或直接把 recordConsentLog 的 INSERT 手工试跑在事务里回滚），
     确认不再出现 Unknown column / 1364 —— 这一步是"发版与切换同窗口"的收口，不能只信本脚本。
  b) 解冻 daily-sync / 站外 CRM 写入（若窗口内做过冻结）。
  c) 保留 ${BACKUP_TABLE} 至少一个发布稳定期；确认无误后由人工另行清理（本脚本绝不 DROP）。

  回滚（一次 RENAME 即可回到切换前）：
    RENAME TABLE \`${OLD_TABLE}\` TO \`${NEW_TABLE}\`, \`${BACKUP_TABLE}\` TO \`${OLD_TABLE}\`;
  注意：回滚只还原表结构与数据，代码侧对上述三列的引用必须同时回退（否则新代码写旧表会报 1364）。
`);

await pool.end();
