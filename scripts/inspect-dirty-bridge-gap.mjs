// 只读：量化"已有桥接行但 levelN_id 是脏值"的第二类缺口
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const STD = "('100','101','102','103','104','105','106','107','108','109')";
const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts/1000), n.deadline_ts)";
const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;

// 1. 桥接行整体：level1_id 标准 / 脏 / 空
const [rowStat] = await pool.query(
  `SELECT
     COUNT(*) AS total_rows,
     SUM(level1_id IN ${STD}) AS std_rows,
     SUM(level1_id = '' OR level1_id IS NULL) AS empty_rows,
     SUM(level1_id <> '' AND level1_id IS NOT NULL AND level1_id NOT IN ${STD}) AS dirty_rows
   FROM crm_bid_notice_unspsc_codes`
);
console.log("1.桥接行 level1_id 质量:", JSON.stringify(rowStat[0]));

// 2. 脏行里 code 是否可用于重算（数字8位 / 字母 / UNCLASSIFIABLE）
const [dirtyKind] = await pool.query(
  `SELECT
     SUM(code REGEXP '^[0-9]{8}$') AS numeric8,
     SUM(code REGEXP '^[A-J]$') AS letter,
     SUM(code = 'UNCLASSIFIABLE') AS unclassifiable,
     SUM(code NOT REGEXP '^[0-9]{8}$' AND code NOT REGEXP '^[A-J]$' AND code <> 'UNCLASSIFIABLE') AS other,
     COUNT(*) AS total
   FROM crm_bid_notice_unspsc_codes
   WHERE level1_id = '' OR level1_id IS NULL OR level1_id NOT IN ${STD}`
);
console.log("2.脏行的 code 形态（决定能否重算）:", JSON.stringify(dirtyKind[0]));

// 3. 有效公告：完全查不到的（有桥接行但无任何一行 level1_id 标准）
const [gap] = await pool.query(
  `SELECT COUNT(*) AS c FROM crm_bid_notices n
   WHERE ${active}
     AND EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id)
     AND NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b2
                     WHERE b2.notice_id = n.id AND b2.level1_id IN ${STD})`
);
console.log("3.有桥接行但全部脏（修复后仍查不到）的有效公告:", gap[0].c);

// 4. 部分脏：有标准行也有脏行（该公告部分类目归属丢失）
const [partial] = await pool.query(
  `SELECT COUNT(*) AS c FROM crm_bid_notices n
   WHERE ${active}
     AND EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id AND b.level1_id IN ${STD})
     AND EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b2 WHERE b2.notice_id = n.id
                 AND (b2.level1_id = '' OR b2.level1_id IS NULL OR b2.level1_id NOT IN ${STD})
                 AND b2.code REGEXP '^[0-9]{8}$')`
);
console.log("4.部分脏（有标准行+有可重算脏行）的有效公告:", partial[0].c);

// 5. 三类缺口汇总
const [[tot]] = await pool.query(`SELECT COUNT(*) AS c FROM crm_bid_notices n WHERE ${active}`);
const [[visible]] = await pool.query(
  `SELECT COUNT(*) AS c FROM crm_bid_notices n
   INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE level1_id IN ${STD}) f
     ON f.notice_id = n.id WHERE ${active}`
);
const [[noBridgeCnt]] = await pool.query(
  `SELECT COUNT(*) AS c FROM crm_bid_notices n WHERE ${active}
     AND NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id)`
);
console.log("5.缺口汇总:", JSON.stringify({
  有效公告总数: Number(tot.c),
  修复后可筛出: Number(visible.c),
  缺口合计: Number(tot.c) - Number(visible.c),
  其中无桥接行: Number(noBridgeCnt.c),
  其中桥接行全脏: Number(gap[0].c),
}));

// 6. 脏行按 code 能否在类目树查到（可重算比例抽样）
const [resolvable] = await pool.query(
  `SELECT COUNT(*) AS resolvable FROM crm_bid_notice_unspsc_codes b
   INNER JOIN crm_unspsc_codes s ON s.code = b.code
   WHERE (b.level1_id = '' OR b.level1_id IS NULL OR b.level1_id NOT IN ${STD})
     AND (b.code REGEXP '^[0-9]{8}$' OR b.code REGEXP '^[A-J]$')`
);
console.log("6.脏行中 code 能在类目树精确匹配到节点的行数:", resolvable[0].resolvable);

await pool.end();
