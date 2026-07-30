// 只读：确认主表 unspsc_codes JSON 中数字码的实际形态（供回填脚本解析）
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts/1000), n.deadline_ts)";
const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;
const noBridge = "NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id)";
const hasCodes = "n.unspsc_codes IS NOT NULL AND n.unspsc_codes <> '' AND n.unspsc_codes <> '[]' AND n.unspsc_codes <> 'null'";

// 1. 含数字码的样本（JSON 里出现数字）
const [numeric] = await pool.query(
  `SELECT n.id, n.source_channel, LEFT(n.unspsc_codes, 300) AS codes
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge} AND ${hasCodes} AND n.unspsc_codes REGEXP '[0-9]{6}'
   LIMIT 6`
);
console.log("1.含数字码样本:", JSON.stringify(numeric, null, 1));

// 2. 数字码 vs 纯字母码 数量
const [split] = await pool.query(
  `SELECT
     SUM(n.unspsc_codes REGEXP '[0-9]{6}') AS with_numeric,
     SUM(n.unspsc_codes NOT REGEXP '[0-9]{6}') AS letters_only,
     COUNT(*) AS total
   FROM crm_bid_notices n
   WHERE ${active} AND ${noBridge} AND ${hasCodes}`
);
console.log("2.数字码/字母码拆分:", JSON.stringify(split[0]));

// 3. 桥接表中现存的字母码行形态（若已有先例，回填按同样格式写）
const [letterRows] = await pool.query(
  `SELECT notice_id, code, code_id, name, level, level1_id, level2_id
   FROM crm_bid_notice_unspsc_codes
   WHERE code REGEXP '^[A-J]$' LIMIT 5`
);
console.log("3.桥接表现存字母码行:", JSON.stringify(letterRows, null, 1));
const [letterCnt] = await pool.query(
  "SELECT COUNT(*) AS c FROM crm_bid_notice_unspsc_codes WHERE code REGEXP '^[A-J]$'"
);
console.log("3a.字母码行总数:", letterCnt[0].c);

// 4. level1_id 的异常值域（此前探针显示 max='J'，确认脏数据形态）
const [oddL1] = await pool.query(
  `SELECT level1_id, COUNT(*) AS c FROM crm_bid_notice_unspsc_codes
   WHERE level1_id NOT IN ('100','101','102','103','104','105','106','107','108','109')
   GROUP BY level1_id ORDER BY c DESC LIMIT 15`
);
console.log("4.非标准 level1_id 值:", JSON.stringify(oddL1));

// 5. 类目表中数字码的存储形态（是否统一 8 位）
const [codeForms] = await pool.query(
  `SELECT level, COUNT(*) AS c, MIN(CHAR_LENGTH(code)) AS min_len, MAX(CHAR_LENGTH(code)) AS max_len
   FROM crm_unspsc_codes GROUP BY level ORDER BY level`
);
console.log("5.类目表 code 长度分布:", JSON.stringify(codeForms));

await pool.end();
