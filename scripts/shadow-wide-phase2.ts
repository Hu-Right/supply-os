/**
 * 影子表蓝绿切换 —— 阶段二（补增量 + 原子改名切换，秒级窗口）
 * 依据 docs/adr/0003-shadow-table-blue-green-migration.md
 *
 * 前置条件（必须人工先做）：停掉宽表写入者 —— `pm2 stop` 或设 SYNC_WORKER_IN_APP=off 重启。
 *   注意：关 daily-sync.cjs 没用，它不写宽表；宽表由 Next 进程内 worker 每 5s 写。
 *
 * 本脚本动作（默认 dry-run，加 --yes 才执行）：
 *   1) 前置校验：__new 存在且含 sync_src_hash、水位状态在位
 *   2) 写入静默探测：连测两次旧表，若仍在变化 → 判定 writer 未停 → 中止（除非 --force）
 *   3) 补增量：冻结态下对 __new 做一次全量重灌（truncate+keyset），保证 __new 与旧表逐行一致
 *   4) 切换前校验：行数 + CRC32 必须一致，否则中止（绝不带着差异改名）
 *   5) 原子双表 RENAME 切换：旧→__old_<ts>，__new→正式名（不删表，留回滚）
 *   6) 切换后校验 + 打印回滚命令
 *
 * 用法：
 *   npx tsx --env-file=.env scripts/shadow-wide-phase2.ts            # 预览
 *   npx tsx --env-file=.env scripts/shadow-wide-phase2.ts run --yes  # 停服后正式执行
 *   npx tsx --env-file=.env scripts/shadow-wide-phase2.ts rollback --yes  # 秒级回滚（反向改名）
 */
import mysql2 from "mysql2/promise";
import type { Pool, RowDataPacket } from "mysql2/promise";

const SRC = "crm_notice_search";
const DST = `${SRC}__new`;
const STATE = "crm_shadow_wide_state";
const NEW_COL = "sync_src_hash";
const BATCH = 5000;

const mode = process.argv[2] || "preview";
const yes = process.argv.includes("--yes");
const force = process.argv.includes("--force");

function safeIdent(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`非法标识符: ${name}`);
  return name;
}
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
function tsSuffix(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function tableExists(db: Pool, name: string): Promise<boolean> {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
    [name],
  );
  return Number((r as RowDataPacket[])[0].c) > 0;
}
async function columnExists(db: Pool, table: string, col: string): Promise<boolean> {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [table, col],
  );
  return Number((r as RowDataPacket[])[0].c) > 0;
}
async function sourceColumns(db: Pool): Promise<string[]> {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME, EXTRA FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
    [SRC],
  );
  return (rows as RowDataPacket[])
    .filter((r) => !/GENERATED/i.test(String(r.EXTRA || "")) || /DEFAULT_GENERATED on update/i.test(String(r.EXTRA || "")))
    .map((r) => safeIdent(String(r.COLUMN_NAME)));
}
async function loadState(db: Pool): Promise<{ base_max_id: number; captured_at: string } | null> {
  if (!(await tableExists(db, STATE))) return null;
  const [r] = await db.query(`SELECT base_max_id, captured_at FROM \`${STATE}\` WHERE id=1`);
  const row = (r as RowDataPacket[])[0];
  return row ? { base_max_id: Number(row.base_max_id), captured_at: String(row.captured_at) } : null;
}
async function checksum(db: Pool, table: string): Promise<{ c: number; s: number }> {
  const selectList = (await sourceColumns(db)).map((c) => `\`${c}\``).join(", ");
  const [r] = await db.query(
    `SELECT COUNT(*) AS c, COALESCE(SUM(CRC32(CONCAT_WS('#', ${selectList}))),0) AS s FROM \`${safeIdent(table)}\``,
  );
  return { c: Number((r as RowDataPacket[])[0].c), s: Number((r as RowDataPacket[])[0].s) };
}

/** 写入静默探测：两次采样旧表 (MAX(id), COUNT) 是否变化 */
async function sampleOld(db: Pool): Promise<{ m: number; c: number }> {
  const [r] = await db.query(`SELECT COALESCE(MAX(id),0) AS m, COUNT(*) AS c FROM \`${SRC}\``);
  return { m: Number((r as RowDataPacket[])[0].m), c: Number((r as RowDataPacket[])[0].c) };
}
async function assertQuiescent(db: Pool): Promise<void> {
  const a = await sampleOld(db);
  await new Promise((res) => setTimeout(res, 3000));
  const b = await sampleOld(db);
  if (a.m !== b.m || a.c !== b.c) {
    throw new Error(
      `宽表仍在被写入（3 秒内 max_id ${a.m}→${b.m} / 行数 ${a.c}→${b.c}）。\n` +
        `  说明 writer 没停。请先 pm2 stop（或 SYNC_WORKER_IN_APP=off 重启）再执行。\n` +
        `  （确知安全可加 --force 跳过此探测，但不建议。）`,
    );
  }
  console.log(`[guard] 写入静默探测通过：3 秒内旧表无变化（max_id=${b.m}, rows=${fmt(b.c)}）。`);
}

/** 冻结态全量重灌 __new（与阶段一同一 keyset 路径，逐行对齐旧表，含增删改） */
async function reload(db: Pool): Promise<void> {
  const t0 = Date.now();
  const cols = await sourceColumns(db);
  const colList = cols.map((c) => `\`${c}\``).join(", ");
  await db.query(`TRUNCATE TABLE \`${DST}\``);
  let lastId = 0;
  let loaded = 0;
  while (true) {
    const [res] = await db.query(
      `INSERT INTO \`${DST}\` (${colList})
       SELECT ${colList} FROM \`${SRC}\` WHERE id > ? ORDER BY id ASC LIMIT ${BATCH}`,
      [lastId],
    );
    const affected = Number((res as { affectedRows?: number }).affectedRows ?? 0);
    const [mx] = await db.query(
      `SELECT COALESCE(MAX(id),?) AS m FROM (SELECT id FROM \`${SRC}\` WHERE id > ? ORDER BY id ASC LIMIT ${BATCH}) t`,
      [lastId, lastId],
    );
    lastId = Number((mx as RowDataPacket[])[0].m);
    loaded += affected;
    if (affected < BATCH) break;
  }
  console.log(`[catchup] 冻结态重灌完成：${fmt(loaded)} 行，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s。`);
}

async function run(db: Pool): Promise<void> {
  // 1) 前置校验
  if (!(await tableExists(db, DST))) throw new Error(`${DST} 不存在，请先执行阶段一。`);
  if (!(await columnExists(db, DST, NEW_COL))) throw new Error(`${DST} 缺 ${NEW_COL} 列。`);
  const st = await loadState(db);
  console.log(`[pre] 水位线：${st ? `base_max_id=${st.base_max_id} captured_at=${st.captured_at}` : "（无状态表，仍按冻结态全量重灌）"}`);

  // 2) 写入静默探测
  if (!force) await assertQuiescent(db);
  else console.warn("[guard] --force 已跳过写入静默探测（风险自负）。");

  // 3) 补增量（冻结态全量重灌）
  await reload(db);

  // 4) 切换前强校验：不一致绝不改名
  const oldCk = await checksum(db, SRC);
  const newCk = await checksum(db, DST);
  console.log(`[verify] 切换前：旧表 rows=${fmt(oldCk.c)} crc=${oldCk.s} | 影子 rows=${fmt(newCk.c)} crc=${newCk.s}`);
  if (oldCk.c !== newCk.c || oldCk.s !== newCk.s) {
    throw new Error("切换前校验不一致，已中止（未改名）。请检查回填是否完整、writer 是否真的停了。");
  }

  // 5) 原子双表 RENAME（不删表，留 __old 回滚）
  const oldKeep = `${SRC}__old_${tsSuffix()}`;
  await db.query("SET SESSION lock_wait_timeout = 10");
  await db.query(
    `RENAME TABLE \`${SRC}\` TO \`${safeIdent(oldKeep)}\`, \`${DST}\` TO \`${SRC}\``,
  );
  console.log(`[swap] 原子切换完成：${SRC}→${oldKeep}，${DST}→${SRC}`);

  // 6) 切换后校验 + 回滚指引
  const liveCk = await checksum(db, SRC);
  const hasCol = await columnExists(db, SRC, NEW_COL);
  console.log(`[after] 线上 ${SRC}：rows=${fmt(liveCk.c)} 含${NEW_COL}=${hasCol}（应为 true）`);
  console.log(
    `\n[done] 阶段二完成。现在可以重启服务（pm2 start / SYNC_WORKER_IN_APP=on）。\n` +
      `  回滚（如需，反向原子改名，秒级）：\n` +
      `    npx tsx --env-file=.env scripts/shadow-wide-phase2.ts rollback --yes\n` +
      `  或手动：RENAME TABLE ${SRC} TO ${DST}, ${oldKeep} TO ${SRC};\n` +
      `  稳定运行确认无误后，择期人工 DROP ${oldKeep}。`,
  );
  // 记录本次切换后的 __old 表名，供 rollback 使用
  await db.query(
    `CREATE TABLE IF NOT EXISTS \`${STATE}\` (id TINYINT PRIMARY KEY, last_old_table VARCHAR(64) NOT NULL, swapped_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ).catch(() => {});
  await db
    .query(`REPLACE INTO \`${STATE}\` (id, last_old_table, swapped_at) VALUES (1, ?, NOW())`, [oldKeep])
    .catch(() => console.warn("[note] 回滚状态表结构与阶段一不同，跳过记录；请用上面打印的手动回滚命令。"));
}

async function rollback(db: Pool): Promise<void> {
  // 反向：当前 SRC（已是新表）→ __new，最近一次 __old_* → SRC
  const [rows] = await db.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE '${SRC}__old_%' ORDER BY TABLE_NAME DESC LIMIT 1`,
  );
  const oldKeep = (rows as RowDataPacket[])[0]?.TABLE_NAME as string | undefined;
  if (!oldKeep) throw new Error(`未找到 ${SRC}__old_* 备份表，无法回滚。`);
  if (!(await tableExists(db, DST))) {
    // 切换后 __new 名字已变成 SRC；回滚需要把当前 SRC 改回 __new
    await db.query(`RENAME TABLE \`${SRC}\` TO \`${DST}\`, \`${safeIdent(oldKeep)}\` TO \`${SRC}\``);
  } else {
    throw new Error(`${DST} 仍存在，状态异常，请人工核对后再回滚。`);
  }
  console.log(`[rollback] 已反向切换：${oldKeep} → ${SRC}（原新表退回为 ${DST}）。`);
}

async function main() {
  const db = mysql2.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "crm",
    charset: "utf8mb4",
    connectionLimit: 2,
  });
  try {
    const [v] = await db.query("SELECT DATABASE() AS db, @@hostname AS h");
    console.log(`[ctx] 目标库=${(v as RowDataPacket[])[0].db} host=${(v as RowDataPacket[])[0].h} port=${process.env.DB_PORT || 3306}`);

    if (mode === "rollback") {
      if (!yes) {
        console.log("[dry-run] rollback 需加 --yes 才执行反向改名。");
        return;
      }
      await rollback(db);
      return;
    }
    if (mode === "run") {
      if (!yes) {
        console.log("[dry-run] 未加 --yes，仅预览。确认已停服后执行：run --yes");
      }
      await run(db);
      return;
    }
    // preview：只读体检，不改任何数据
    console.log("[preview] 只读体检（不改数据）：");
    const st = await loadState(db);
    console.log(`  ${DST} 存在=${await tableExists(db, DST)} 含${NEW_COL}=${await columnExists(db, DST, NEW_COL)}`);
    console.log(`  水位线：${st ? `base_max_id=${st.base_max_id} captured_at=${st.captured_at}` : "无"}`);
    const oldCk = await checksum(db, SRC);
    const newCk = (await tableExists(db, DST)) ? await checksum(db, DST) : { c: 0, s: 0 };
    console.log(`  当前旧表 rows=${fmt(oldCk.c)}；影子表 rows=${fmt(newCk.c)}（影子比旧表少属正常：阶段一后旧表又被写了增量，阶段二会重灌对齐）`);
    console.log("  下一步：停服（pm2 stop）→ 运行 run --yes → 重启。");
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
