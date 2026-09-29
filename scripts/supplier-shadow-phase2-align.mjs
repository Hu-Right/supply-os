/**
 * 影子表阶段二：按 supplier__idmap 把所有指向 supplier.id 的下游引用级联改写为新 id
 *
 * 与 shadow-users-phase2 的差异：supplier 的下游全部是**逻辑外键**（无物理 FK，见
 * docs/数据库设计/supplier-供应商目录主表.md §1），因此不做影子副本，直接原表
 * UPDATE JOIN idmap（与 dedup/sweep 脚本同款），但保留同级的校验强度：
 *   · MUST 白名单 9 表 10 列，改写前后行数守恒；
 *   · 悬挂引用 fail-closed：改写前若发现指向「无映射旧行」的引用（即指向被排除的
 *     已合并/测试行），导出 JSON 并非零退出——吸收阶段应已把这类引用迁走，出现即异常；
 *   · 改写后复查：全部引用都能落在 supplier__new 的 1..N。
 *
 * 另：crm_supplier_dedup_review 的 duplicate 裁决已在阶段一消化（行被吸收并打标），
 *     其过滤语义随 intelligence-daily service.ts 的 NOT IN 一并退役，本阶段把它
 *     全量导出 JSON 后 DROP。
 *
 * 默认 dry-run；--apply 才写库。
 * 用法：node scripts/supplier-shadow-phase2-align.mjs [--apply]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "out");
const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^DB_[A-Z]+=/ && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/["']/g, "").trim()]),
);

const pool = await mysql.createPool({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, charset: "utf8mb4", connectionLimit: 2,
  dateStrings: true,
});

const NEW_TABLE = "supplier__new";
const MAP_TABLE = "supplier__idmap";
const REVIEW_TABLE = "crm_supplier_dedup_review";

/** MUST：阶段二要级联改写的全部 表.列（与 phase1 的 REF_COLUMNS 一致；supplier_table 过滤口径保留） */
const MUST = [
  { table: "crm_supplier_claims", column: "supplier_id", where: "" },
  { table: "crm_user_supplier_pool", column: "supplier_id", where: "" },
  { table: "crm_users", column: "supplier_id", where: "" },
  { table: "crm_bid_supplier_recommendations", column: "supplier_id", where: " AND supplier_table='supplier'" },
  { table: "crm_training_registrations", column: "converted_supplier_id", where: "" },
  { table: "crm_training_registrations", column: "portal_supplier_id", where: "" },
  { table: "crm_supplier_diagnosis", column: "supplier_id", where: "" },
  { table: "crm_supplier_translations", column: "supplier_id", where: "" },
  { table: "crm_supplier_unspsc_interests", column: "supplier_id", where: " AND supplier_table='supplier'" },
];

function fail(msg) {
  console.error(`\n[FATAL] ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}
const q = (s) => `\`${s}\``;
async function tableExists(table) {
  const [[e]] = await pool.query(
    `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [env.DB_NAME, table],
  );
  return Number(e.n) > 0;
}

// ── 0. 前置状态（本库不存在的引用表跳过并登记，口径与 phase1 的 ACTIVE_REFS 一致）──
const MUST_ACTIVE = [];
for (const rc of MUST) {
  if (await tableExists(rc.table)) MUST_ACTIVE.push(rc);
  else console.log(`[0] 引用表 ${rc.table} 在本库不存在，跳过`);
}
if (MUST_ACTIVE.length === 0) fail("没有任何存在的引用表，核对库名/环境");

const [[mapStat]] = await pool.query(`SELECT COUNT(*) n, MIN(new_id) mn, MAX(new_id) mx FROM \`${MAP_TABLE}\``);
const [[newStat]] = await pool.query(`SELECT COUNT(*) n FROM \`${NEW_TABLE}\``);
console.log(`[0] idmap=${Number(mapStat.n)} 行（new_id ${Number(mapStat.mn)}..${Number(mapStat.mx)}），${NEW_TABLE}=${Number(newStat.n)} 行`);
if (Number(mapStat.n) === 0) fail("idmap 为空：先跑 phase1");
if (Number(mapStat.n) !== Number(newStat.n)) fail("idmap 与影子表行数不一致：先跑 phase1 --delta 补齐");

// DELTA 漏斗检查：源表里还有未映射的干净行 → 让用户先跑 phase1 --delta
{
  const [[unmapped]] = await pool.query(
    `SELECT COUNT(*) n FROM supplier s
      WHERE s.merged_id IS NULL AND s.company <> '测试'
        AND NOT EXISTS (SELECT 1 FROM \`${MAP_TABLE}\` m WHERE m.old_id = s.id)`,
  );
  if (Number(unmapped.n) > 0) {
    fail(`源表还有 ${Number(unmapped.n)} 行未映射的干净行，先执行 phase1 --apply --delta 再回来`);
  }
}

// ── 1. 悬挂引用预检（fail-closed）──
const orphans = [];
for (const rc of MUST_ACTIVE) {
  const [rows] = await pool.query(
    `SELECT t.\`${rc.column}\` old_id, COUNT(*) n
       FROM \`${rc.table}\` t
       LEFT JOIN \`${MAP_TABLE}\` m ON m.old_id = t.\`${rc.column}\`
      WHERE t.\`${rc.column}\` IS NOT NULL AND m.old_id IS NULL${rc.where}
      GROUP BY t.\`${rc.column}\``,
  );
  for (const r of rows) {
    orphans.push({ table: rc.table, column: rc.column, old_id: Number(r.old_id), refs: Number(r.n) });
  }
}
if (orphans.length > 0) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const p = path.join(OUT_DIR, `supplier-phase2-orphans-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify(orphans, null, 2));
  fail(`发现 ${orphans.length} 个悬挂引用（指向被排除行或不存在行），已导出 ${p}。逐条裁决后再重跑`);
}
console.log("[1] 悬挂引用预检通过：0 条");

// ── 2. 改写前引用计数快照 ──
const before = {};
for (const rc of MUST_ACTIVE) {
  const [[c]] = await pool.query(
    `SELECT COUNT(*) n FROM \`${rc.table}\` t WHERE t.\`${rc.column}\` IS NOT NULL${rc.where}`,
  );
  before[`${rc.table}.${rc.column}`] = Number(c.n);
}
console.log(`[2] 改写前引用数：${JSON.stringify(before)}`);

if (!APPLY) {
  console.log("\n[DRY-RUN] 执行计划：");
  for (const rc of MUST_ACTIVE) {
    console.log(`  UPDATE \`${rc.table}\` JOIN idmap SET ${rc.column}=new_id${rc.where ? `（${rc.where.trim()}）` : ""}：${before[`${rc.table}.${rc.column}`]} 行`);
  }
  console.log(`  之后：导出并 DROP ${REVIEW_TABLE}（裁决已消化）`);
  await pool.end();
  process.exit(0);
}

// ── 3. 级联改写（逐表执行，前后计数守恒校验）──
for (const rc of MUST_ACTIVE) {
  const key = `${rc.table}.${rc.column}`;
  await pool.query(
    `UPDATE \`${rc.table}\` t JOIN \`${MAP_TABLE}\` m ON m.old_id = t.\`${rc.column}\`
        SET t.\`${rc.column}\` = m.new_id WHERE 1=1${rc.where}`,
  );
  const [[after]] = await pool.query(
    `SELECT COUNT(*) n FROM \`${rc.table}\` t WHERE t.\`${rc.column}\` IS NOT NULL${rc.where}`,
  );
  if (Number(after.n) !== before[key]) fail(`${key} 改写前后引用数不守恒（${before[key]} → ${Number(after.n)}）`);
  console.log(`[3] ${key}: ${before[key]} 行已重映射`);
}

// ── 4. 改写后复查：所有引用必须落在影子表 1..N ──
for (const rc of MUST_ACTIVE) {
  const [[bad]] = await pool.query(
    `SELECT COUNT(*) n FROM \`${rc.table}\` t
       LEFT JOIN \`${NEW_TABLE}\` n ON n.id = t.\`${rc.column}\`
      WHERE t.\`${rc.column}\` IS NOT NULL AND n.id IS NULL${rc.where}`,
  );
  if (Number(bad.n) > 0) fail(`${rc.table}.${rc.column} 仍有 ${Number(bad.n)} 条引用无法落到影子表`);
}
console.log("[4] 全部引用已落在 supplier__new 1..N");

// ── 5. 裁决表退役：全量导出 → DROP ──
{
  const [exists] = await pool.query(
    `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [env.DB_NAME, REVIEW_TABLE],
  );
  if (Number(exists[0].n) > 0) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const [rows] = await pool.query(`SELECT * FROM \`${REVIEW_TABLE}\``);
    const p = path.join(OUT_DIR, `dedup-review-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(p, JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 2));
    await pool.query(`DROP TABLE \`${REVIEW_TABLE}\``);
    console.log(`[5] ${REVIEW_TABLE} 已导出（${rows.length} 行）并退役：${p}`);
  } else {
    console.log(`[5] ${REVIEW_TABLE} 不存在，跳过`);
  }
}

console.log("\n✅ 阶段二完成：9 表 10 列下游引用已按 idmap 重映射，裁决台账已退役。");
console.log("   下一步：阶段三 supplier-shadow-phase3-cutover.mjs 预检 + 原子 RENAME（--execute --confirm CUTOVER 才落刀）。");
await pool.end();
