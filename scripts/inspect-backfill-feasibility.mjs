// 只读探针：无分类码公告能否从主表 unspsc_codes 列回填（兜底可行性）
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  connectionLimit: 2,
});

const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts/1000), n.deadline_ts)";
const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;
const noBridge = "NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id)";

// 1. 无桥接行的有效公告中，主表 unspsc_codes 列的填充情况
const [fill] = await pool.query(
  `SELECT
     COUNT(*) AS total,
     SUM(n.unspsc_codes IS NOT NULL AND n.unspsc_codes <> '' AND n.unspsc_codes <> '[]' AND n.unspsc_codes <> 'null') AS has_main_codes,
     SUM(n.ai_analyzed_at IS NOT NULL) AS ai_analyzed,
     SUM(n.title IS NULL OR n.title = '') AS no_title
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge}`
);
console.log("1.无桥接行公告的主表字段填充:", JSON.stringify(fill[0]));

// 2. 其中主表有码的样本（看格式，评估回填脚本可行性）
const [sample] = await pool.query(
  `SELECT n.id, n.source_channel, LEFT(n.unspsc_codes, 120) AS codes_head, n.ai_analyzed_at
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge}
     AND n.unspsc_codes IS NOT NULL AND n.unspsc_codes <> '' AND n.unspsc_codes <> '[]' AND n.unspsc_codes <> 'null'
   LIMIT 5`
);
console.log("2.主表有码样本:", JSON.stringify(sample, null, 1));

// 3. 主表有码的无桥接公告，按渠道分布
const [byCh] = await pool.query(
  `SELECT n.source_channel, COUNT(*) AS c
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge}
     AND n.unspsc_codes IS NOT NULL AND n.unspsc_codes <> '' AND n.unspsc_codes <> '[]' AND n.unspsc_codes <> 'null'
   GROUP BY n.source_channel ORDER BY c DESC LIMIT 10`
);
console.log("3.可回填公告的渠道分布:", JSON.stringify(byCh, null, 1));

await pool.end();
