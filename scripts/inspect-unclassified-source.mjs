// 只读探针：无分类码公告的存储位置与 source_channel 分布
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

// 1. crm_bid_notices 列结构（确认 source_channel 等来源字段）
const [cols] = await pool.query("SHOW COLUMNS FROM crm_bid_notices");
console.log("1.crm_bid_notices 列:", cols.map((c) => c.Field).join(", "));

// 2. 有效且无分类码的公告，按 source_channel 分布
const [byChannel] = await pool.query(
  `SELECT n.source_channel, COUNT(*) AS c
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge}
   GROUP BY n.source_channel ORDER BY c DESC`
);
console.log("2.无分类码有效公告 source_channel 分布:", JSON.stringify(byChannel, null, 1));

// 3. 对照：全部有效公告的 source_channel 分布
const [allChannel] = await pool.query(
  `SELECT n.source_channel, COUNT(*) AS c
   FROM crm_bid_notices n
   WHERE ${active}
   GROUP BY n.source_channel ORDER BY c DESC`
);
console.log("3.全部有效公告 source_channel 分布:", JSON.stringify(allChannel, null, 1));

// 4. 无分类码公告样本（看来源与时间特征）
const [sample] = await pool.query(
  `SELECT n.id, n.source_channel, n.country, n.published_date, n.create_time, n.ai_analyzed_at,
          LEFT(n.title, 60) AS title_head
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge}
   ORDER BY n.id DESC LIMIT 5`
);
console.log("4.无分类码公告样本:", JSON.stringify(sample, null, 1));

// 5. 无分类码公告的入库时间分布（判断是不是某批新数据未跑 AI 分类）
const [byMonth] = await pool.query(
  `SELECT DATE_FORMAT(n.create_time, '%Y-%m') AS ym, COUNT(*) AS c
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge}
   GROUP BY ym ORDER BY ym DESC LIMIT 12`
);
console.log("5.无分类码公告入库月份分布:", JSON.stringify(byMonth, null, 1));

await pool.end();
