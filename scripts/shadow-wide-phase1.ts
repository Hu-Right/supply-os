/**
 * 影子表蓝绿切换 —— 阶段一（仅建影子表 + 加列 + 回填 + 校验，原表零改动）
 * 依据 docs/adr/0003-shadow-table-blue-green-migration.md
 *
 * 目标表：crm_notice_search（宽表，单一写入者=app 同步 worker；无 FK/触发器/生成列，本地镜像实测）
 * 产出：crm_notice_search__new（结构与原表一致 + 新增 sync_src_hash 列 + 全量数据）
 *
 * 绝不做：RENAME、改旧表名、写旧表。切换（阶段二）必须经人工确认后另行执行。
 *
 * 用法：
 *   npx tsx --env-file=.env scripts/shadow-wide-phase1.ts verify        # 只读校验/状态查看
 *   npx tsx --env-file=.env scripts/shadow-wide-phase1.ts build         # 预览（不写库）
 *   npx tsx --env-file=.env scripts/shadow-wide-phase1.ts build --yes   # 真正执行阶段一
 */
import mysql2 from "mysql2/promise";
import type { Pool, RowDataPacket } from "mysql2/promise";

const SRC = "crm_notice_search";
const DST = `${SRC}__new`;
const STATE = "crm_shadow_wide_state";
const NEW_COL = "sync_src_hash";
const BATCH = 5000;

const doBuild = process.argv.includes("build");
const confirmed = process.argv.includes("--yes");

/** 标识符白名单校验（列名来自 information_schema，拼接进 SQL 前必须过一遍） */
function safeIdent(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`非法标识符，拒绝拼接 SQL: ${name}`);
  return name;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** 取源表列清单（按建表顺序）；生成列会被排除（不可 INSERT），本表实测无生成列 */
async function sourceColumns(db: Pool): Promise<string[]> {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME, EXTRA FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [SRC],
  );
  return (rows as RowDataPacket[])
    .filter((r) => !/GENERATED/i.test(String(r.EXTRA || "")) || /DEFAULT_GENERATED on update/i.test(String(r.EXTRA || "")))
    .map((r) => safeIdent(String(r.COLUMN_NAME)));
}

async function tableExists(db: Pool, name: string): Promise<boolean> {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name],
  );
  return Number((rows as RowDataPacket[])[0].c) > 0;
}

async function columnExists(db: Pool, table: string, col: string): Promise<boolean> {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col],
  );
  return Number((rows as RowDataPacket[])[0].c) > 0;
}

/** 结构自检：列数、字符集、索引数、sync_src_hash 是否就位 */
async function describe(db: Pool, table: string) {
  const [cols] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
    [table],
  );
  const [idx] = await db.query(
    `SELECT COUNT(DISTINCT INDEX_NAME) AS c FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
    [table],
  );
  return {
    columns: Number((cols as RowDataPacket[])[0].c),
    indexes: Number((idx as RowDataPacket[])[0].c),
    hasNewCol: await columnExists(db, table, NEW_COL),
  };
}

/** 一致性校验：行数 + 关键字段 CRC32 聚合 */
async function checksum(db: Pool, table: string): Promise<{ c: number; s: number }> {
  const selectList = (await sourceColumns(db)).map((c) => `\`${c}\``).join(", ");
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(CRC32(CONCAT_WS('#', ${selectList}))), 0) AS s
     FROM \`${safeIdent(table)}\``,
  );
  const r = (rows as RowDataPacket[])[0];
  return { c: Number(r.c), s: Number(r.s) };
}

async function ensureStateTable(db: Pool): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS \`${STATE}\` (
       id TINYINT NOT NULL PRIMARY KEY,
       src_table VARCHAR(64) NOT NULL,
       dst_table VARCHAR(64) NOT NULL,
       base_max_id BIGINT NOT NULL,
       captured_at DATETIME NOT NULL,
       src_count BIGINT NOT NULL,
       dst_count BIGINT NOT NULL,
       note VARCHAR(255) NOT NULL DEFAULT ''
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
}

async function build(db: Pool): Promise<void> {
  const t0 = Date.now();
  const cols = await sourceColumns(db);
  const colList = cols.map((c) => `\`${c}\``).join(", ");
  console.log(`[phase1] 源表列 ${cols.length} 个，回填将显式列出（排除生成列，若有）。`);

  // 1) 建影子表（LIKE 复制列/索引/字符集/自增定义；本表无 FK/触发器，无复制缺口）
  if (await tableExists(db, DST)) {
    console.log(`[phase1] ${DST} 已存在，复用（将清空重灌，幂等）。`);
  } else {
    await db.query(`CREATE TABLE \`${DST}\` LIKE \`${SRC}\``);
    console.log(`[phase1] 已创建 ${DST}（LIKE ${SRC}）。`);
  }

  // 2) 新表加列 sync_src_hash（钉 INSTANT + 短锁等待；空表/小表瞬时）
  if (await columnExists(db, DST, NEW_COL)) {
    console.log(`[phase1] ${DST}.${NEW_COL} 已存在，跳过加列。`);
  } else {
    await db.query("SET SESSION lock_wait_timeout = 5");
    await db.query(
      `ALTER TABLE \`${DST}\`
         ADD COLUMN \`${NEW_COL}\` CHAR(32) NOT NULL DEFAULT ''
         COMMENT '宽表内容与输入快照的一致性指纹，由 buildWideRow 同快照写入，对账只比对不修改',
         ALGORITHM=INSTANT`,
    );
    console.log(`[phase1] 已在 ${DST} 新增 ${NEW_COL}（INSTANT）。`);
  }

  // 3) 清空重灌（仅动影子表），keyset 分批：id 稀疏（达 17.8 亿量级），绝不能用固定 id 区间
  await db.query(`TRUNCATE TABLE \`${DST}\``);
  let lastId = 0;
  let loaded = 0;
  let batchNo = 0;
  while (true) {
    const [res] = await db.query(
      `INSERT INTO \`${DST}\` (${colList})
       SELECT ${colList} FROM \`${SRC}\`
       WHERE id > ? ORDER BY id ASC LIMIT ${BATCH}`,
      [lastId],
    );
    const affected = Number((res as { affectedRows?: number }).affectedRows ?? 0);
    const [mx] = await db.query(
      `SELECT COALESCE(MAX(id), ?) AS m FROM (SELECT id FROM \`${SRC}\` WHERE id > ? ORDER BY id ASC LIMIT ${BATCH}) t`,
      [lastId, lastId],
    );
    lastId = Number((mx as RowDataPacket[])[0].m);
    loaded += affected;
    batchNo++;
    if (batchNo % 20 === 0 || affected < BATCH) {
      console.log(`[phase1]   批次 ${batchNo}：累计 ${fmt(loaded)} 行（游标 id=${lastId}）`);
    }
    if (affected === 0 || affected < BATCH) {
      if (affected === 0) break;
      // 末批：affected<BATCH 表示已到尾部
      break;
    }
  }

  // 4) 记录阶段二所需水位线（base_max_id + captured_at：增量 = id>base 或 updated_at>captured）
  await ensureStateTable(db);
  const capturedAt = new Date();
  const srcCnt = await checksum(db, SRC);
  await db.query(
    `REPLACE INTO \`${STATE}\`
       (id, src_table, dst_table, base_max_id, captured_at, src_count, dst_count, note)
     VALUES (1, ?, ?, ?, ?, ?, ?, 'phase1 built')`,
    [SRC, DST, lastId, capturedAt, srcCnt.c, loaded],
  );

  console.log(
    `[phase1] 回填完成：${fmt(loaded)} 行 → ${DST}，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s；` +
      `水位线 base_max_id=${lastId} 已记录，供阶段二补增量。`,
  );
}

async function verify(db: Pool): Promise<boolean> {
  if (!(await tableExists(db, DST))) {
    console.log(`[verify] ${DST} 不存在——阶段一尚未执行。`);
    return false;
  }
  const srcDesc = await describe(db, SRC);
  const dstDesc = await describe(db, DST);
  const srcCk = await checksum(db, SRC);
  const dstCk = await checksum(db, DST);

  console.log("[verify] ── 结构自检 ──");
  console.log(`  原表  ${SRC}: 列=${srcDesc.columns} 索引=${srcDesc.indexes} 含${NEW_COL}=${srcDesc.hasNewCol}`);
  console.log(`  影子  ${DST}: 列=${dstDesc.columns} 索引=${dstDesc.indexes} 含${NEW_COL}=${dstDesc.hasNewCol}`);
  const structOk = dstDesc.columns === srcDesc.columns + 1 && dstDesc.indexes === srcDesc.indexes && dstDesc.hasNewCol;
  console.log(`  影子表应 = 原表列数+1（sync_src_hash）、索引数一致、含新列 → ${structOk ? "OK" : "MISMATCH"}`);

  console.log("[verify] ── 数据校验 ──");
  console.log(`  行数：原表=${fmt(srcCk.c)} 影子=${fmt(dstCk.c)} 差=${fmt(srcCk.c - dstCk.c)}`);
  console.log(`  CRC32聚合：原表=${srcCk.s} 影子=${dstCk.s} ${srcCk.s === dstCk.s ? "（一致）" : "（不一致：回填期间原表可能有新写入，属正常，阶段二补增量处理）"}`);

  const [st] = await db.query(`SELECT * FROM \`${STATE}\` WHERE id=1`).catch(() => [[] as RowDataPacket[]]);
  const s = (st as RowDataPacket[])[0];
  if (s) console.log(`  水位线：base_max_id=${s.base_max_id} captured_at=${s.captured_at} src_count=${s.src_count} dst_count=${s.dst_count}`);

  return structOk && srcCk.c === dstCk.c;
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

    if (process.argv.includes("verify")) {
      const ok = await verify(db);
      console.log(ok ? "[verify] ✅ 阶段一产物校验通过，可交人工检视。" : "[verify] ⚠️ 存在差异，见上。");
      return;
    }

    if (!doBuild) {
      console.log("用法：build（预览）| build --yes（执行）| verify（校验）");
      return;
    }
    if (!confirmed) {
      console.log("[dry-run] 未加 --yes，仅预览。将对影子表执行：");
      console.log(`  1) CREATE TABLE ${DST} LIKE ${SRC}`);
      console.log(`  2) ALTER ${DST} ADD COLUMN ${NEW_COL}`);
      console.log(`  3) TRUNCATE ${DST} → keyset 分批 INSERT…SELECT（批 ${BATCH}）`);
      console.log(`  原表 ${SRC} 全程只读，绝不改名。确认无误后加 --yes 执行。`);
      await verify(db);
      return;
    }
    await build(db);
    console.log("\n[phase1] ── 自动校验 ──");
    await verify(db);
    console.log("\n[phase1] 阶段一完成，已停在人工闸口。请检视影子表后再决定是否进入阶段二（切换需另行批准）。");
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
