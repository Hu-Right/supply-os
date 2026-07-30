// 只读：厘清 crm_bid_notices 各口径计数，定位 58517 vs 58547 差异来源
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const q = async (label, sql, params = []) => {
  try {
    const [[r]] = await pool.query(sql, params);
    console.log(`${String(label).padEnd(52)}: ${r.c}`);
  } catch (e) {
    console.log(`${String(label).padEnd(52)}: ERROR ${e.message}`);
  }
};

console.log("========== crm_bid_notices 各口径计数 ==========");
await q("1. 全表 COUNT(*)", "SELECT COUNT(*) AS c FROM crm_bid_notices");
await q("2. status='published' / 类似有效态", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE status = 'published'");
await q("3. deadline_ts IS NULL 或未过期(>=NOW)", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE deadline_ts IS NULL OR deadline_ts >= NOW()");
await q("4. deadline_ts 已过期(<NOW)", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE deadline_ts < NOW()");
await q("5. is_deleted=0 / 未删除(若列存在)", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE COALESCE(is_deleted,0) = 0");
await q("6. unspsc_codes 非空", "SELECT COUNT(*) AS c FROM crm_bid_notices WHERE unspsc_codes IS NOT NULL AND JSON_LENGTH(unspsc_codes) > 0");

console.log("\n========== 桥接表可见性口径 ==========");
await q("7. 桥接表 DISTINCT notice_id", "SELECT COUNT(DISTINCT notice_id) AS c FROM crm_bid_notice_unspsc_codes");
await q("8. 桥接 level1_id IN 100~109 的 DISTINCT notice", "SELECT COUNT(DISTINCT notice_id) AS c FROM crm_bid_notice_unspsc_codes WHERE level1_id IN ('100','101','102','103','104','105','106','107','108','109')");

console.log("\n========== status 取值分布 ==========");
try {
  const [rows] = await pool.query("SELECT status, COUNT(*) AS c FROM crm_bid_notices GROUP BY status ORDER BY c DESC");
  for (const r of rows) console.log(`  status=${JSON.stringify(r.status)} : ${r.c}`);
} catch (e) { console.log("  status 分组 ERROR:", e.message); }

console.log("\n========== 列结构确认 ==========");
try {
  const [cols] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crm_bid_notices' ORDER BY ORDINAL_POSITION"
  );
  console.log("  " + cols.map((c) => c.COLUMN_NAME).join(", "));
} catch (e) { console.log("  列查询 ERROR:", e.message); }

await pool.end();
