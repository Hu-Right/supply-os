// 只读：脏行是"历史遗留"还是"管线仍在产生"？按 id 与 created_at 分布判断
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const STD = "('100','101','102','103','104','105','106','107','108','109')";
const dirty = `(level1_id = '' OR level1_id NOT IN ${STD})`;

const [[range]] = await pool.query(
  `SELECT MIN(id) AS min_id, MAX(id) AS max_id, MIN(created_at) AS min_ct, MAX(created_at) AS max_ct
   FROM crm_bid_notice_unspsc_codes`
);
console.log("1.全表 id/时间范围:", JSON.stringify(range));

const [[d]] = await pool.query(
  `SELECT COUNT(*) AS c, MIN(id) AS min_id, MAX(id) AS max_id, MIN(created_at) AS min_ct, MAX(created_at) AS max_ct
   FROM crm_bid_notice_unspsc_codes WHERE ${dirty}`
);
console.log("2.脏行 id/时间范围:", JSON.stringify(d));

// 按天统计：正常 vs 脏
const [byDay] = await pool.query(
  `SELECT DATE(created_at) AS d,
          SUM(${dirty}) AS dirty_rows,
          SUM(NOT ${dirty}) AS clean_rows
   FROM crm_bid_notice_unspsc_codes
   GROUP BY DATE(created_at) ORDER BY d`
);
console.log("3.按创建日分布（脏 / 正常）:");
for (const r of byDay) console.log(`   ${r.d instanceof Date ? r.d.toISOString().slice(0,10) : r.d}  dirty=${r.dirty_rows}  clean=${r.clean_rows}`);

// 最近的脏行长什么样
const [recent] = await pool.query(
  `SELECT id, notice_id, code, code_id, level, level1_id, created_at
   FROM crm_bid_notice_unspsc_codes WHERE ${dirty} ORDER BY id DESC LIMIT 5`
);
console.log("4.最新 5 条脏行:");
for (const r of recent) console.log(`   ${JSON.stringify(r)}`);

await pool.end();
