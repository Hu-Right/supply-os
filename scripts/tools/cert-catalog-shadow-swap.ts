/**
 * 认证字典影子表重建 + 原子换表（2026-11-26）
 *
 * 目标：把 150 条基准全部「已分类 + 已启用」，用影子表原子替换，不走迁移。
 *
 *   ① 建 supplier_certifications_new（LIKE 原表，含全部索引）
 *   ② 全量复制 150 行
 *   ③ 给 61 条未分类项补 product_scopes，并统一 is_active=1
 *   ④ 校验：150 行 / 150 唯一 code / 0 空桶 / 桶值合法
 *   ⑤ --swap 时单条 RENAME 原子换表，旧表留作备份
 *
 * 用法（/root/supply-os 下）：
 *   npx tsx scripts/tools/cert-catalog-shadow-swap.ts           # 只建影子表并校验
 *   npx tsx scripts/tools/cert-catalog-shadow-swap.ts --swap    # 校验通过后原子换表
 */
import { readFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { normalizeProductScopes, PRODUCT_SCOPE_CODES } from "../../src/shared/constants/product-scopes";

const NEW_TABLE = "supplier_certifications_new";
const OLD_TABLE = "supplier_certifications_old_20261126";

/** 61 条未分类项的产品桶（沿用原始 89 条的既有惯例） */
const SCOPE_PLAN: Record<string, string[]> = {
  "BLUE-ANGEL": ["all"], "EU-ECOLABEL": ["all"], "ISO14067": ["all"], "ISO14068": ["all"],
  "GJB9001": ["all"], "AEO": ["all"], "JIS": ["all"], "NOM": ["all"], "SIRIM": ["all"],
  "QCVN": ["all"], "ECAS": ["all"], "GS-MARK": ["all"], "CQC": ["all"], "CBAM": ["all"],
  "PPE": ["all"], "BIFMA": ["all"],

  "ORGANIC-CN": ["food_contact"], "FSSC22000": ["food_contact"], "GLOBALGAP": ["food_contact"],
  "HALAL": ["food_contact"], "MSC": ["food_contact"], "RSPO": ["food_contact"],
  "UTZ": ["food_contact"], "ASC": ["food_contact"], "FAIRTRADE": ["food_contact"],
  "RAINFOREST": ["food_contact"],

  "MDSAP": ["medical"], "TGA": ["medical"], "HEALTHCANADA": ["medical"], "NMPA": ["medical"],
  "CDSCO": ["medical"], "PMDA": ["medical"], "MFDS": ["medical"],

  "EPEAT": ["eee"], "ANATEL": ["eee"], "MTCTE": ["eee"], "RED": ["eee"], "WEEE": ["eee"],
  "ETL": ["eee"], "RBA": ["eee"],

  "PED": ["machinery"], "TPED": ["machinery"], "EN15085": ["machinery"],
  "ISO22163": ["machinery"], "AS9120": ["machinery"],

  "BREEAM": ["construction"], "WRAS": ["construction"], "CARB": ["construction"],
  "TSCA": ["construction"], "WATERMARK": ["construction"],

  "GOTS": ["textile"], "OCS": ["textile"], "WRAP": ["textile"],

  "PCI-DSS": ["services"], "SOC2": ["services"], "C-TPAT": ["services"],

  "VDA6.3": ["auto"], "TISAX": ["auto"],

  "IECEX": ["eee", "chemical"], "ACS": ["construction", "food_contact"], "ISO9712": ["lab"],
};

const SWAP = process.argv.includes("--swap");
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

// 0) 计划自检：桶值合法
const bad = Object.entries(SCOPE_PLAN)
  .filter(([, bs]) => bs.some((b) => !PRODUCT_SCOPE_CODES.includes(b)))
  .map(([c]) => c);
if (bad.length) { console.error("非法桶值：", bad); process.exit(1); }

const [src] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) n FROM supplier_certifications");
console.log(`[src] 现有字典 ${Number(src[0].n)} 行`);

// ① 建影子表（已存在则重建，保证幂等）
await pool.query(`DROP TABLE IF EXISTS ${NEW_TABLE}`);
await pool.query(`CREATE TABLE ${NEW_TABLE} LIKE supplier_certifications`);
await pool.query(`INSERT INTO ${NEW_TABLE} SELECT * FROM supplier_certifications`);
console.log(`[new] 已复制 ${Number(src[0].n)} 行到 ${NEW_TABLE}`);

// ② 补 61 条的产品桶
const [pending] = await pool.query<RowDataPacket[]>(
  `SELECT code FROM ${NEW_TABLE} WHERE product_scopes IS NULL OR is_active = 0`,
);
const codes = pending.map((r) => String(r.code));
const missing = codes.filter((c) => !SCOPE_PLAN[c]);
const extra = Object.keys(SCOPE_PLAN).filter((c) => !codes.includes(c));
if (missing.length) { console.error("[abort] 影子表里存在未在计划内的待分类项：", missing); process.exit(1); }
if (extra.length) { console.error("[abort] 计划里有影子表不需要的项：", extra); process.exit(1); }

let filled = 0;
for (const code of codes) {
  const scopes = normalizeProductScopes(SCOPE_PLAN[code]);
  await pool.execute(
    `UPDATE ${NEW_TABLE} SET product_scopes = ?, is_active = 1 WHERE code = ?`,
    [JSON.stringify(scopes), code],
  );
  filled += 1;
}
await pool.query(`UPDATE ${NEW_TABLE} SET is_active = 1`);
console.log(`[fill] 补齐并启用 ${filled} 条（其余保持原值）`);

// ③ 校验
const [stat] = await pool.query<RowDataPacket[]>(
  `SELECT COUNT(*) total, COUNT(DISTINCT code) codes, SUM(is_active = 1) active_,
          SUM(product_scopes IS NULL OR JSON_LENGTH(product_scopes) = 0) empty_scope
     FROM ${NEW_TABLE}`,
);
const s = stat[0] as Record<string, unknown>;
const total = Number(s.total), uniqueCodes = Number(s.codes), active = Number(s.active_), empty = Number(s.empty_scope);
console.log(`[check] 总行 ${total} · 唯一 code ${uniqueCodes} · 已启用 ${active} · 空桶 ${empty}`);
let ok = total === 150 && uniqueCodes === 150 && active === 150 && empty === 0;

// 桶值合法性抽查（列出所有实际出现的桶）
const [bucketRows] = await pool.query<RowDataPacket[]>(
  `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(product_scopes, CONCAT('$[', n.i, ']'))) b
     FROM ${NEW_TABLE} JOIN (SELECT 0 i UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) n
    WHERE JSON_LENGTH(product_scopes) > n.i`,
);
const buckets = bucketRows.map((r) => String(r.b)).filter(Boolean);
const illegal = buckets.filter((b) => !PRODUCT_SCOPE_CODES.includes(b));
if (illegal.length) { console.error("[check] 非法桶：", illegal); ok = false; }
console.log(`[check] 出现的桶：${buckets.sort().join(", ")}`);

// ④ 引用完整性：企业持有记录的 code 是否都还在
const [orphan] = await pool.query<RowDataPacket[]>(
  `SELECT COUNT(*) n FROM (
     SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(value_json, '$.code')) code
       FROM enterprise_capability_items WHERE capability_type = 'certification') x
   LEFT JOIN ${NEW_TABLE} t ON t.code = x.code
   WHERE x.code IS NOT NULL AND x.code <> 'null' AND t.code IS NULL`,
);
const orphanN = Number((orphan[0] as { n: number }).n);
console.log(`[check] 持有记录孤儿引用 ${orphanN} 条`);
if (orphanN > 0) ok = false;

if (!ok) { console.error("[abort] 校验未通过，未换表"); await pool.end(); process.exit(1); }

if (!SWAP) {
  console.log("[dry] 校验通过。加 --swap 执行原子换表");
} else {
  // ⑤ 原子换表（单条 RENAME，MySQL 原子生效）
  await pool.query(`DROP TABLE IF EXISTS ${OLD_TABLE}`);
  await pool.query(`RENAME TABLE supplier_certifications TO ${OLD_TABLE}, ${NEW_TABLE} TO supplier_certifications`);
  console.log(`[swap] 已换表：${OLD_TABLE}（备份） / supplier_certifications（新 150）`);
  const [post] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) total, SUM(is_active = 1) active_, SUM(product_scopes IS NULL) empty_scope FROM supplier_certifications",
  );
  console.log(`[swap] 换表后：${Number(post[0].total)} 行 · 启用 ${Number(post[0].active_)} · 空桶 ${Number(post[0].empty_scope)}`);
}

await pool.end();
