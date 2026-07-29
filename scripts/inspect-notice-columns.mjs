// 只读探查：crm_bid_notices 列定义 + deadline_ts 取值形态（G.2/F.3 实施前置确认）
// 用途：1) deadline_ts 是毫秒时间戳还是 DATETIME（决定 F.3 兜底 WHERE 写法）
//       2) 是否存在 published_date 等发布时间字段（G.6 第 2 项）
// 纯 SELECT/DESCRIBE，不改任何数据，可复跑可删
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  connectionLimit: 2,
});

try {
  const [cols] = await pool.query("SHOW COLUMNS FROM crm_bid_notices");
  console.log("== crm_bid_notices 全部列 ==");
  for (const c of cols) console.log(`${c.Field.padEnd(28)} ${c.Type.padEnd(22)} null=${c.Null}`);

  const [sample] = await pool.query(
    `SELECT deadline, deadline_ts, published_date
     FROM crm_bid_notices
     WHERE deadline_ts IS NOT NULL
     ORDER BY id DESC LIMIT 5`
  ).catch(async (err) => {
    // published_date 列可能不存在：退化为只取 deadline 两列
    console.log("(published_date 不存在:", err.message, ")");
    return pool.query(
      `SELECT deadline, deadline_ts FROM crm_bid_notices WHERE deadline_ts IS NOT NULL ORDER BY id DESC LIMIT 5`
    );
  });
  console.log("\n== deadline_ts 样例（最近 5 条）==");
  for (const r of sample) console.log(JSON.stringify(r));

  const [stats] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(deadline_ts IS NULL) AS ts_null,
            SUM(deadline_ts >= UNIX_TIMESTAMP(NOW()) * 1000) AS future_if_ms
     FROM crm_bid_notices`
  );
  console.log("\n== deadline_ts 统计（按毫秒口径试算未来条数）==");
  console.log(JSON.stringify(stats[0]));
} finally {
  await pool.end();
}
