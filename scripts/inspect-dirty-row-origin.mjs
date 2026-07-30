// 只读：验证脏行来源 —— 是否为 server.ts syncUnspscBridgeRow 的"码前缀"写法所致
// syncUnspscBridgeRow 特征：level1_id = LEFT(code,2)、level2_id = LEFT(code,4)、level5_id 恒 NULL
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const STD = "('100','101','102','103','104','105','106','107','108','109')";
const dirty = `(level1_id = '' OR level1_id NOT IN ${STD})`;

const [[a]] = await pool.query(
  `SELECT
     COUNT(*) AS dirty_total,
     SUM(code REGEXP '^[0-9]+$' AND level1_id = LEFT(code,2)) AS prefix_pattern,
     SUM(code REGEXP '^[0-9]+$' AND level1_id = LEFT(code,2) AND level2_id = LEFT(code,4)) AS prefix_l2_too,
     SUM(level1_id REGEXP '^[A-Za-z]$') AS letter_pattern,
     SUM(level1_id = '') AS empty_pattern
   FROM crm_bid_notice_unspsc_codes WHERE ${dirty}`
);
console.log("1.脏行形态归因:", JSON.stringify(a));

// server.ts 写法的另一指纹：level5_id 恒为 NULL/空（因 rawCode 最长 8 位，>=10 永不成立）
const [[b]] = await pool.query(
  `SELECT COUNT(*) AS c, SUM(level5_id IS NULL OR level5_id = '') AS l5_empty
   FROM crm_bid_notice_unspsc_codes
   WHERE ${dirty} AND code REGEXP '^[0-9]+$' AND level1_id = LEFT(code,2)`
);
console.log("2.前缀形态行的 level5_id 是否恒空:", JSON.stringify(b));

// 时间分布：前缀形态 vs 字母形态，看谁在近期增长
const [byDay] = await pool.query(
  `SELECT DATE(created_at) AS d,
     SUM(code REGEXP '^[0-9]+$' AND level1_id = LEFT(code,2)) AS prefix_rows,
     SUM(level1_id REGEXP '^[A-Za-z]$') AS letter_rows
   FROM crm_bid_notice_unspsc_codes
   WHERE ${dirty} AND created_at IS NOT NULL
   GROUP BY DATE(created_at) HAVING prefix_rows > 0 OR letter_rows > 0 ORDER BY d DESC LIMIT 12`
);
console.log("3.近期分布（前缀形态 / 字母形态）:");
for (const r of byDay) {
  const d = r.d instanceof Date ? r.d.toISOString().slice(0, 10) : r.d;
  console.log(`   ${d}  prefix=${r.prefix_rows}  letter=${r.letter_rows}`);
}

// 这些前缀形态行涉及多少条公告，其中多少是"全脏"（即被 server.ts 写坏后不可见）
const [[c]] = await pool.query(
  `SELECT COUNT(DISTINCT notice_id) AS notices
   FROM crm_bid_notice_unspsc_codes
   WHERE ${dirty} AND code REGEXP '^[0-9]+$' AND level1_id = LEFT(code,2)`
);
console.log("4.前缀形态行涉及公告数:", JSON.stringify(c));

await pool.end();
