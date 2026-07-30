// 只读：定位 58547 口径 —— 试各种过滤组合命中该数
import mysql from "mysql2/promise";
const pool = mysql.createPool({ host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2 });
const q = async (label, sql) => {
  try { const [[r]] = await pool.query(sql); console.log(`${String(label).padEnd(56)}: ${r.c}`); }
  catch (e) { console.log(`${String(label).padEnd(56)}: ERROR ${e.message}`); }
};
console.log("========== 候选过滤列计数 ==========");
await q("is_expired = 0", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE is_expired = 0");
await q("is_expired = 1", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE is_expired = 1");
await q("is_qualified = 1", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE is_qualified = 1");
await q("is_qualified = 0", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE is_qualified = 0");
await q("is_converted = 0", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE is_converted = 0");
await q("ai_analyzed_at IS NOT NULL", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE ai_analyzed_at IS NOT NULL");
await q("ai_products IS NOT NULL", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE ai_products IS NOT NULL AND ai_products <> ''");

console.log("\n========== 组合口径 ==========");
await q("is_expired=0 AND unspsc_codes 非空", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE is_expired=0 AND unspsc_codes IS NOT NULL AND JSON_LENGTH(unspsc_codes)>0");
await q("is_qualified=1 AND is_expired=0", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE is_qualified=1 AND is_expired=0");
await q("is_qualified=1 AND unspsc 非空", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE is_qualified=1 AND unspsc_codes IS NOT NULL AND JSON_LENGTH(unspsc_codes)>0");

console.log("\n========== tenant_id 分布 ==========");
try {
  const [rows] = await pool.query("SELECT tenant_id, COUNT(*) AS c FROM crm_bid_notices GROUP BY tenant_id ORDER BY c DESC LIMIT 10");
  for (const r of rows) console.log(`  tenant_id=${JSON.stringify(r.tenant_id)} : ${r.c}`);
} catch (e) { console.log("  ERROR", e.message); }

console.log("\n========== is_expired 取值分布 ==========");
try {
  const [rows] = await pool.query("SELECT is_expired, COUNT(*) AS c FROM crm_bid_notices GROUP BY is_expired");
  for (const r of rows) console.log(`  is_expired=${JSON.stringify(r.is_expired)} : ${r.c}`);
} catch (e) { console.log("  ERROR", e.message); }

console.log("\n========== is_qualified 取值分布 ==========");
try {
  const [rows] = await pool.query("SELECT is_qualified, COUNT(*) AS c FROM crm_bid_notices GROUP BY is_qualified");
  for (const r of rows) console.log(`  is_qualified=${JSON.stringify(r.is_qualified)} : ${r.c}`);
} catch (e) { console.log("  ERROR", e.message); }

await pool.end();
