// 只读：确认桥接表真实列类型（server.ts 的 CREATE TABLE 写的是 INT NULL，
// 但实测存在 '' 和 'B' 这类值，说明远端实际表结构可能是 varchar）
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const [cols] = await pool.query("SHOW COLUMNS FROM crm_bid_notice_unspsc_codes");
console.log("1.桥接表列定义:");
for (const c of cols) console.log(`   ${c.Field.padEnd(14)} ${c.Type.padEnd(16)} null=${c.Null} key=${c.Key}`);

const [[t]] = await pool.query(
  "SELECT CREATE_TIME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA='crm' AND TABLE_NAME='crm_bid_notice_unspsc_codes'"
);
console.log("2.表创建时间/行数:", JSON.stringify(t));

const [samples] = await pool.query(
  `SELECT id, notice_id, code, code_id, level, level1_id, level2_id
   FROM crm_bid_notice_unspsc_codes
   WHERE level1_id NOT IN ('100','101','102','103','104','105','106','107','108','109')
      OR level1_id = '' OR level1_id IS NULL
   LIMIT 6`
);
console.log("3.脏行样本:");
for (const s of samples) console.log(`   ${JSON.stringify(s)}`);

const [good] = await pool.query(
  "SELECT id, notice_id, code, code_id, level, level1_id, level2_id FROM crm_bid_notice_unspsc_codes WHERE level1_id IN ('100','109') LIMIT 3"
);
console.log("4.正常行样本:");
for (const s of good) console.log(`   ${JSON.stringify(s)}`);

await pool.end();
