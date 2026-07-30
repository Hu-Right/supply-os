// 只读探针：无桥接公告的主表 unspsc_codes 码粒度统计（字母大类 vs 数字码）
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

// 1. 码粒度：JSON 里 code 值是纯字母（A-J 大类）还是数字码
const [stat] = await pool.query(
  `SELECT
     COUNT(*) AS total,
     SUM(n.unspsc_codes REGEXP '"code": ?"[0-9]') AS has_digit_code,
     SUM(n.unspsc_codes REGEXP '"code": ?"[A-J]"') AS has_letter_only,
     SUM(n.unspsc_codes REGEXP 'UNCLASSIFIABLE') AS unclassifiable
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge}
     AND n.unspsc_codes IS NOT NULL AND n.unspsc_codes <> '' AND n.unspsc_codes <> '[]' AND n.unspsc_codes <> 'null'`
);
console.log("1.码粒度统计:", JSON.stringify(stat[0]));

// 2. 有数字码的样本（评估能否精确回填到桥接表）
const [digit] = await pool.query(
  `SELECT n.id, n.source_channel, LEFT(n.unspsc_codes, 150) AS codes_head
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge} AND n.unspsc_codes REGEXP '"code": ?"[0-9]'
   LIMIT 3`
);
console.log("2.数字码样本:", JSON.stringify(digit, null, 1));

// 3. TED 渠道的样本（未分类的大头，看它的码长什么样）
const [ted] = await pool.query(
  `SELECT n.id, LEFT(n.unspsc_codes, 150) AS codes_head
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge} AND n.source_channel = 'TED'
   LIMIT 3`
);
console.log("3.TED 未分类样本:", JSON.stringify(ted, null, 1));

await pool.end();
