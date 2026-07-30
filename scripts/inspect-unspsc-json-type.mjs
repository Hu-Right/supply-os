// 只读：确认 unspsc_codes 列类型与 mysql2 返回的 JS 类型
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const [cols] = await pool.query("SHOW COLUMNS FROM crm_bid_notices LIKE 'unspsc_codes'");
console.log("1.列定义:", JSON.stringify(cols));

const [rows] = await pool.query(
  "SELECT id, unspsc_codes FROM crm_bid_notices WHERE id IN (35195, 33937) ORDER BY id"
);
for (const r of rows) {
  const v = r.unspsc_codes;
  console.log(`2.id=${r.id} typeof=${typeof v} isArray=${Array.isArray(v)}`);
  console.log(`   raw=${JSON.stringify(v).slice(0, 240)}`);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      console.log(`   JSON.parse OK, isArray=${Array.isArray(p)}, len=${p.length}`);
    } catch (e) {
      console.log(`   JSON.parse FAILED: ${e.message}`);
    }
  }
}

await pool.end();
