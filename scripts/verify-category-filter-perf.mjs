// Step 3 性能确认探针（只读）：索引情况 + EXPLAIN + 实测耗时
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  connectionLimit: 2,
});

const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;

const run = async () => {
  const [idx] = await pool.query("SHOW INDEX FROM crm_bid_notice_unspsc_codes");
  console.log(
    "1.桥接表索引:",
    JSON.stringify(idx.map((r) => ({ name: r.Key_name, col: r.Column_name, seq: r.Seq_in_index, uniq: r.Non_unique === 0 })))
  );

  const [exp] = await pool.query(
    "EXPLAIN SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE level1_id = '109'"
  );
  console.log("2.EXPLAIN level1_id='109':", JSON.stringify(exp));

  const [exp2] = await pool.query(
    "EXPLAIN SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE level2_id = '107371'"
  );
  console.log("3.EXPLAIN level2_id:", JSON.stringify(exp2));

  // 实测最重的 J 大类完整列表查询耗时（模拟 /api/notices 第一页）
  for (const [label, level, id] of [["J(最大类)", 1, "109"], ["A", 1, "100"], ["81段", 2, "107371"]]) {
    const t0 = Date.now();
    await pool.query(
      `SELECT n.id, n.title FROM crm_bid_notices n
       INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE level${level}_id = ?) f
         ON f.notice_id = n.id
       WHERE ${active}
       ORDER BY ${sec} IS NULL, ${sec} ASC
       LIMIT 20`,
      [id]
    );
    console.log(`4.${label} 列表查询耗时: ${Date.now() - t0}ms`);
    const t1 = Date.now();
    await pool.query(
      `SELECT COUNT(*) AS c FROM crm_bid_notices n
       INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE level${level}_id = ?) f
         ON f.notice_id = n.id
       WHERE ${active}`,
      [id]
    );
    console.log(`4a.${label} COUNT 耗时: ${Date.now() - t1}ms`);
  }

  await pool.end();
};

run().catch(async (e) => {
  console.error("ERROR:", e.message);
  await pool.end();
  process.exit(1);
});
