// 只读诊断：精确定位 R5 源头缺码的两类残余，验证可直接用的 SQL 口径
import mysql from "mysql2/promise";
const pool = mysql.createPool({ host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2 });
const STD = "('100','101','102','103','104','105','106','107','108','109')";
const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts/1000), n.deadline_ts)";
const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;

console.log("========== R5-A：无法解析的桥接脏行（crm_bid_notice_unspsc_codes）==========");
const [[a]] = await pool.query(
  `SELECT COUNT(*) AS c FROM crm_bid_notice_unspsc_codes WHERE level1_id = '' OR level1_id IS NULL OR level1_id NOT IN ${STD}`
);
console.log(`残留脏行总数（回填后应=无法解析数）: ${a.c}`);
// 形态归因
const [[ashape]] = await pool.query(
  `SELECT SUM(code REGEXP '^[0-9]+$') AS numeric_code, SUM(code NOT REGEXP '^[0-9]+$') AS nonnumeric,
          SUM(level1_id='' OR level1_id IS NULL) AS empty_l1
   FROM crm_bid_notice_unspsc_codes WHERE level1_id = '' OR level1_id IS NULL OR level1_id NOT IN ${STD}`
);
console.log("形态:", JSON.stringify(ashape));
// 这些 code 在类目树里是否真的查不到（数字码补零后仍无匹配）
const [[aorphan]] = await pool.query(
  `SELECT COUNT(*) AS c FROM crm_bid_notice_unspsc_codes b
   WHERE (b.level1_id='' OR b.level1_id IS NULL OR b.level1_id NOT IN ${STD})
     AND NOT EXISTS (SELECT 1 FROM crm_unspsc_codes u WHERE u.code = b.code
        OR u.code = LPAD(RPAD(b.code,8,'0'),8,'0') OR u.code = RPAD(b.code,8,'0'))`
);
console.log(`其中 code 在类目树确实查不到: ${aorphan.c}`);
const [atop] = await pool.query(
  `SELECT code, COUNT(*) AS c FROM crm_bid_notice_unspsc_codes
   WHERE level1_id = '' OR level1_id IS NULL OR level1_id NOT IN ${STD}
   GROUP BY code ORDER BY c DESC LIMIT 12`
);
console.log("无法解析 code TOP12:", JSON.stringify(atop.map(r => [r.code, r.c])));

console.log("\n========== R5-B：有效公告但无桥接行（crm_bid_notices）==========");
const [[b]] = await pool.query(
  `SELECT COUNT(*) AS c FROM crm_bid_notices n
   WHERE ${active}
     AND NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes x WHERE x.notice_id = n.id)`
);
console.log(`有效且无桥接行（含 JSON 空/无码）: ${b.c}`);
const [[b2]] = await pool.query(
  `SELECT COUNT(*) AS c FROM crm_bid_notices n
   WHERE ${active}
     AND NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes x WHERE x.notice_id = n.id)
     AND n.unspsc_codes IS NOT NULL AND n.unspsc_codes <> '' AND n.unspsc_codes <> '[]' AND n.unspsc_codes <> 'null'`
);
console.log(`其中 unspsc_codes JSON 非空（真·源头缺码残余）: ${b2.c}`);
const [[b3]] = await pool.query(
  `SELECT COUNT(*) AS c FROM crm_bid_notices n
   WHERE ${active}
     AND NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes x WHERE x.notice_id = n.id)
     AND (n.unspsc_codes IS NULL OR n.unspsc_codes = '' OR n.unspsc_codes = '[]' OR n.unspsc_codes = 'null')`
);
console.log(`其中 unspsc_codes JSON 空（本就无码）: ${b3.c}`);

console.log("\n========== 合计 ==========");
console.log(`R5 合计 ≈ ${a.c}(脏行) + ${b2.c}(公告) = ${Number(a.c) + Number(b2.c)}`);

await pool.end();
