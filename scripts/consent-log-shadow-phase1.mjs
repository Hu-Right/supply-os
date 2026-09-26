/**
 * crm_consent_log 影子表蓝绿切换 · 阶段一（建 __new + 分批回填 + 校验）
 *
 * 依据 docs/adr/0003-shadow-table-blue-green-migration.md：
 *   阶段一**只建影子表并回填**，旧表不改名、继续跑生产，全程不触碰线上读路径。
 *   阶段二（人工闸口）才是 scripts/consent-log-shadow-phase2-cutover.mjs。
 *
 * 本表变更内容（2026-09-26 结构核查后定稿）：
 *   - 删除退役列 `user_key`（+ 其死索引 `idx_user_key`）：身份锚点已于迁移 068 统一到
 *     user_id，实库 155 行该列全部为 NULL，运行期 INSERT 恒写 NULL；
 *   - 删除退役列 `consent_timestamp`：客户端 ISO 串在原实现里只被剥掉 T/Z、未做时区换算，
 *     落库值恒比服务端 created_at 早 8 小时（28800 秒），是错值而非事实；同意时间的事实源
 *     收敛为 `created_at`。**该列的旧值不迁移**（错值没有取证价值，且迁移它等于把错误搬进新表）；
 *   - `id` 改 BIGINT UNSIGNED（与 crm_users.id / 本表 user_id 同符号，消除 JOIN 侧隐式转换）；
 *   - 删除 `source_page`（2026-09-26 补定）：全仓对本表**只有一句 INSERT、零处 SELECT**（写了 155 次没人看过一次）；
 *     155 行恒为 `register`，零区分度；且它与 `consent_type` 完全同义——现在三个写入点（注册写 terms/privacy、
 *     AI 设置页写 llm_outbound_data）光看 consent_type 就能定位场景。注释里的 checkout/profile 是从未实现的假设。
 *     真出现「同一份条款在非注册页重新征求」时再加回（可空列属 ADR-0003 低风险增量，一次 ALTER 即可）。
 *     ★ 现在删的成本差：影子表尚未切换，改 DDL + 重跑阶段一即可；切换后再删需再来一整轮蓝绿切换。
 *   - 其余列/索引/字符集/排序规则与旧表逐字一致；补齐表级与列级 COMMENT。
 *
 * 结构 SSOT：`src/lib/db/migrations/099-consent-log-birth-structure.ts` 的 CREATE TABLE。
 *   本脚本 DDL 与之逐字对齐（099 决定全新环境的出生结构，本脚本决定已部署库的切换目标，
 *   两者必须同构，否则切换后新环境与生产结构分叉）。改动任一处必须同步另一处。
 *
 * 安全边界：
 *   - 只 CREATE/DROP 带 __new 后缀的一张新表，绝不 ALTER/RENAME/DROP 旧表；
 *   - 可重复执行（幂等）：重跑先 DROP 上一轮的 __new 再重建重灌；
 *   - 回填后做逐列 NULL-safe 全等校验 + id 集合校验 + 结构自检，任一不符即非零退出，
 *     且不留下"半成品结论"（__new 保留供排查，但脚本末尾会明确标注校验未通过）。
 *   - 本表无触发器、无被外键引用（切换前脚本会再核一次这两项）。
 *
 * 用法：node scripts/consent-log-shadow-phase1.mjs
 */
import fs from "fs";
import mysql from "mysql2/promise";

const OLD_TABLE = "crm_consent_log";
const NEW_TABLE = "crm_consent_log__new";
const BATCH_SIZE = 5000;

/** 目标结构的列清单（顺序即回填 SELECT 顺序；不含三个退役列） */
const KEEP_COLUMNS = [
  "id", "user_id", "consent_type", "document_version", "action",
  "ip_address", "user_agent", "created_at",
];
const RETIRED_COLUMNS = ["user_key", "consent_timestamp", "source_page"];

const NEW_DDL = `
  CREATE TABLE ${NEW_TABLE} (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '流水主键（无业务语义，仅定位单条留痕）',
    user_id          BIGINT UNSIGNED NULL COMMENT '同意人 ID（crm_users.id）；已删用户/匿名化留痕行保持 NULL，属预期非孤儿',
    consent_type     VARCHAR(32)     NOT NULL COMMENT '同意事项：terms=用户条款 / privacy=隐私政策 / marketing=营销 / cookie=Cookie / llm_outbound_data=AI 数据出站授权',
    document_version VARCHAR(20)     NOT NULL COMMENT '被同意的协议版本号（合规举证核心：证明他同意的是当时那一版）',
    action           VARCHAR(16)     NOT NULL COMMENT '本次动作：agree=同意 / withdraw=撤回 / re-agree=重新同意；append-only，当前生效态取该 (user_id, consent_type) 最新一行',
    ip_address       VARCHAR(45)     NULL COMMENT '同意时客户端 IP（取自 x-forwarded-for 首段，属可伪造的弱证据，保留期为合规策略项）',
    user_agent       VARCHAR(512)    NULL COMMENT '同意时浏览器/设备标识（同为弱证据，辅助还原同意场景）',
    created_at       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '落库时间 = 服务端记录到的同意时间（本表唯一时间事实源）',
    PRIMARY KEY (id),
    INDEX idx_consent_type (consent_type),
    INDEX idx_consent_log_user_id (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='协议同意审计日志：注册勾选条款/隐私、AI 数据出站授权等 P0 合规留痕（append-only，撤回也新增一行）'
`;

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^DB_[A-Z]+=/ && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/["']/g, "").trim()]),
);

const pool = await mysql.createPool({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, charset: "utf8mb4", connectionLimit: 2,
});

const fail = async (msg) => { console.error(`[FATAL] ${msg}`); await pool.end(); process.exit(1); };
const q = async (sql, args) => (await pool.query(sql, args))[0];

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ── 0. 前置取证：旧表存在、无触发器、未被外键引用 ──
const oldExists = (await q(
  `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
  [OLD_TABLE],
))[0].n > 0;
if (!oldExists) await fail(`旧表 ${OLD_TABLE} 不存在——本脚本用于已部署库；全新环境请直接跑迁移 099 得到终态结构。`);

const trigs = await q(
  `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TRIGGERS WHERE EVENT_OBJECT_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = ?`,
  [OLD_TABLE],
);
if (Number(trigs[0].n) > 0) await fail(`${OLD_TABLE} 上存在 ${trigs[0].n} 个触发器：CREATE TABLE LIKE/新建表不复制触发器，须先人工处置再跑本脚本。`);

const fkIn = await q(
  `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
   WHERE REFERENCED_TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = ?`,
  [OLD_TABLE],
);
if (Number(fkIn[0].n) > 0) await fail(`有 ${fkIn[0].n} 张表的外键引用了 ${OLD_TABLE}，RENAME 切换会改变其指向对象，须先人工核对。`);

const oldCols = (await q(
  `SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
  [OLD_TABLE],
)).map((r) => r.c);
const stillHasRetired = RETIRED_COLUMNS.filter((c) => oldCols.includes(c));
console.log(`[0] 旧表就绪：列=${oldCols.length} 行=${(await q(`SELECT COUNT(*) AS n FROM \`${OLD_TABLE}\``))[0].n}`
  + (stillHasRetired.length > 0 ? `，待删列在位：${stillHasRetired.join("/")}` : "，待删列已不在（说明本库已切换过，阶段一无需重跑）"));

const oldRowCount = Number((await q(`SELECT COUNT(*) AS n FROM \`${OLD_TABLE}\``))[0].n);
const oldAutoInc = Number((await q(
  `SELECT AUTO_INCREMENT AS ai FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
  [OLD_TABLE],
))[0].ai || 0);

// ── 1. 建影子表（幂等：重跑先删上一轮 __new）──
await pool.query(`DROP TABLE IF EXISTS \`${NEW_TABLE}\``);
await pool.query(NEW_DDL);
console.log(`[1] 已建影子表 ${NEW_TABLE}（结构以迁移 099 为 SSOT）`);

// 结构自检：列集合与索引集合必须等于目标态
const newCols = (await q(
  `SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
  [NEW_TABLE],
)).map((r) => r.c);
check(JSON.stringify(newCols) === JSON.stringify(KEEP_COLUMNS), "列集合 = 目标列集合",
  `期望 [${KEEP_COLUMNS}] 实得 [${newCols}]`);
check(RETIRED_COLUMNS.every((c) => !newCols.includes(c)), "退役列不在新表", RETIRED_COLUMNS.join("/"));

const newIdx = (await q(
  `SELECT DISTINCT INDEX_NAME i FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
  [NEW_TABLE],
)).map((r) => r.i).sort();
check(JSON.stringify(newIdx) === JSON.stringify(["PRIMARY", "idx_consent_log_user_id", "idx_consent_type"]),
  "索引集合 = 目标索引集合（idx_user_key 已随列消失）", `[${newIdx}]`);

const badCharset = await q(
  `SELECT COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND (CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> 'utf8mb4'
     OR COLLATION_NAME IS NOT NULL AND COLLATION_NAME <> 'utf8mb4_0900_ai_ci')`,
  [NEW_TABLE],
);
check(badCharset.length === 0, "字符集/排序规则全表统一 utf8mb4 / utf8mb4_0900_ai_ci", badCharset.map((r) => r.c).join(","));

// ── 2. 分批回填（按 id 分段，保 id 不变使站外 CRM 的引用继续成立）──
const idRange = await q(`SELECT COALESCE(MIN(id), 0) AS lo, COALESCE(MAX(id), 0) AS hi FROM \`${OLD_TABLE}\``);
const [lo, hi] = [Number(idRange[0].lo), Number(idRange[0].hi)];
let copied = 0;
for (let start = lo; oldRowCount > 0 && start <= hi; start += BATCH_SIZE) {
  const end = Math.min(start + BATCH_SIZE - 1, hi);
  const res = await pool.query(
    `INSERT INTO \`${NEW_TABLE}\` (${KEEP_COLUMNS.map((c) => `\`${c}\``).join(", ")})
     SELECT ${KEEP_COLUMNS.map((c) => `\`${c}\``).join(", ")} FROM \`${OLD_TABLE}\` WHERE id BETWEEN ? AND ?`,
    [start, end],
  );
  copied += Number(res[0].affectedRows);
}
console.log(`[2] 回填完成：从旧表 ${oldRowCount} 行了 ${copied} 行进 ${NEW_TABLE}（id 区间 ${lo}..${hi}，批大小 ${BATCH_SIZE}）`);

// ── 3. 自增值对齐（必须 ≥ 旧表，否则切换后主键冲突）──
const newMaxId = Number((await q(`SELECT COALESCE(MAX(id), 0) AS m FROM \`${NEW_TABLE}\``))[0].m);
const nextId = Math.max(oldAutoInc, newMaxId + 1);
await pool.query(`ALTER TABLE \`${NEW_TABLE}\` AUTO_INCREMENT = ${nextId}`);
console.log(`[3] 自增对齐：旧表 AUTO_INCREMENT=${oldAutoInc}，__new 已置 ${nextId}`);

// ── 4. 逐列 NULL-safe 全等校验（含 id 集合闭合）──
const newRowCount = Number((await q(`SELECT COUNT(*) AS n FROM \`${NEW_TABLE}\``))[0].n);
check(newRowCount === oldRowCount, "行数一致", `旧 ${oldRowCount} / 新 ${newRowCount}`);

const idSetDiff = Number((await q(
  `SELECT (SELECT COUNT(*) FROM \`${OLD_TABLE}\` o WHERE NOT EXISTS(
     SELECT 1 FROM \`${NEW_TABLE}\` n WHERE n.id = o.id)) AS missing_in_new`,
))[0].missing_in_new);
check(idSetDiff === 0, "旧表每个 id 在新表都存在（无漏灌）", `缺失 ${idSetDiff}`);

for (const col of KEEP_COLUMNS.filter((c) => c !== "id")) {
  const mism = Number((await q(
    `SELECT COUNT(*) AS n FROM \`${OLD_TABLE}\` o JOIN \`${NEW_TABLE}\` n ON n.id = o.id
     WHERE NOT (o.\`${col}\` <=> n.\`${col}\`)`,
  ))[0].n);
  check(mism === 0, `列 ${col} 逐行 NULL-safe 全等`, `不等 ${mism}`);
}

// 抽样人眼复核（只取非敏感列，避免把 IP/UA 打进日志）
const sample = await q(`SELECT id, user_id, consent_type, document_version, action, created_at
  FROM \`${NEW_TABLE}\` ORDER BY id LIMIT 3`);
console.log("[4] 抽样（前 3 行，已避开 IP/UA）:", JSON.stringify(sample));

console.log(`\n[5] 阶段一结论：${failures === 0 ? "校验全过" : `校验 ${failures} 项不符`}`);
console.log("    - 旧表未改名、未 ALTER，生产读写路径零变化；");
console.log("    - 测试/预览请把数据源指向 " + NEW_TABLE + "（不要读写线上旧表）；");
console.log("    - 阶段二（冻结外部写入 → 补增量 → 原子 RENAME）必须人工确认后另行运行：");
console.log("      node scripts/consent-log-shadow-phase2-cutover.mjs --confirm=phase2-cutover");
console.log("    - ⚠ 切换必须与「auth.repo.recordConsentLog 已停止写这三列」的发版同窗口，否则同意日志写入会失败。");

await pool.end();
if (failures > 0) { console.error(`[FATAL] 校验未通过 ${failures} 项，请排查后重跑阶段一。`); process.exit(1); }
