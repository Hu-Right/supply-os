// 只读探针：多大类归属现象专项调查
// 1) 每条公告挂几个大类的分布 2) 大类共现矩阵 3) 跨类目公告样本 4) A~J 类目树结构
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
// 合法大类 id：100~109
const validSeg = "b.level1_id IN ('100','101','102','103','104','105','106','107','108','109')";

// 1. 每条有效公告挂的大类数量分布（1个/2个/3个+）
const [dist] = await pool.query(
  `SELECT seg_cnt, COUNT(*) AS notices
   FROM (
     SELECT b.notice_id, COUNT(DISTINCT b.level1_id) AS seg_cnt
     FROM crm_bid_notice_unspsc_codes b
     INNER JOIN crm_bid_notices n ON n.id = b.notice_id
     WHERE ${active} AND ${validSeg}
     GROUP BY b.notice_id
   ) t GROUP BY seg_cnt ORDER BY seg_cnt`
);
console.log("1.每条公告挂大类数量分布:", JSON.stringify(dist, null, 1));

// 2. 每条公告挂的码数量分布（细粒度码，非大类）
const [codeDist] = await pool.query(
  `SELECT
     SUM(code_cnt = 1) AS c1, SUM(code_cnt = 2) AS c2, SUM(code_cnt = 3) AS c3,
     SUM(code_cnt BETWEEN 4 AND 10) AS c4_10, SUM(code_cnt > 10) AS c10plus,
     MAX(code_cnt) AS max_codes, ROUND(AVG(code_cnt),2) AS avg_codes
   FROM (
     SELECT b.notice_id, COUNT(*) AS code_cnt
     FROM crm_bid_notice_unspsc_codes b
     INNER JOIN crm_bid_notices n ON n.id = b.notice_id
     WHERE ${active} AND ${validSeg}
     GROUP BY b.notice_id
   ) t`
);
console.log("2.每条公告码数量分布:", JSON.stringify(codeDist[0]));

// 3. 大类共现 TOP15（哪两个大类最常一起出现）
const [cooc] = await pool.query(
  `SELECT s1.code AS seg_a, s2.code AS seg_b, COUNT(DISTINCT a.notice_id) AS notices
   FROM (SELECT DISTINCT notice_id, level1_id FROM crm_bid_notice_unspsc_codes WHERE level1_id BETWEEN '100' AND '109') a
   INNER JOIN (SELECT DISTINCT notice_id, level1_id FROM crm_bid_notice_unspsc_codes WHERE level1_id BETWEEN '100' AND '109') b2
     ON a.notice_id = b2.notice_id AND a.level1_id < b2.level1_id
   INNER JOIN crm_bid_notices n ON n.id = a.notice_id
   INNER JOIN crm_unspsc_codes s1 ON s1.id = a.level1_id
   INNER JOIN crm_unspsc_codes s2 ON s2.id = b2.level1_id
   WHERE ${active}
   GROUP BY s1.code, s2.code ORDER BY notices DESC LIMIT 15`
);
console.log("3.大类共现TOP15:", JSON.stringify(cooc, null, 1));

// 4. 挂大类最多的公告样本（看真实业务场景）
const [multi] = await pool.query(
  `SELECT b.notice_id, COUNT(DISTINCT b.level1_id) AS segs,
          GROUP_CONCAT(DISTINCT s.code ORDER BY s.code) AS seg_codes,
          COUNT(*) AS code_rows, LEFT(MAX(n.title), 80) AS title_head, MAX(n.source_channel) AS ch
   FROM crm_bid_notice_unspsc_codes b
   INNER JOIN crm_bid_notices n ON n.id = b.notice_id
   INNER JOIN crm_unspsc_codes s ON s.id = b.level1_id
   WHERE ${active} AND ${validSeg}
   GROUP BY b.notice_id
   HAVING segs >= 4 ORDER BY segs DESC LIMIT 8`
);
console.log("4.挂4个以上大类的公告样本:", JSON.stringify(multi, null, 1));

// 5. A~J 类目树结构：每个大类的 level2 子节点清单 + 各层级节点数
const [tree] = await pool.query(
  `SELECT p.code AS seg, p.id AS seg_id, p.title_zh AS seg_title,
          c.code AS l2_code, c.id AS l2_id, c.title_zh AS l2_title
   FROM crm_unspsc_codes p
   INNER JOIN crm_unspsc_codes c ON c.parent_id = p.id
   WHERE p.level = 1
   ORDER BY p.code, c.code`
);
console.log("5.A~J 大类 → 二级段码清单:", JSON.stringify(tree, null, 1));

// 6. 每个大类下各层级节点数统计（按 parent_id 逐层 LEFT JOIN）
const [segLevels] = await pool.query(
  `SELECT p.code AS seg,
          COUNT(DISTINCT l2.id) AS l2_cnt,
          COUNT(DISTINCT l3.id) AS l3_cnt,
          COUNT(DISTINCT l4.id) AS l4_cnt,
          COUNT(DISTINCT l5.id) AS l5_cnt
   FROM crm_unspsc_codes p
   LEFT JOIN crm_unspsc_codes l2 ON l2.parent_id = p.id
   LEFT JOIN crm_unspsc_codes l3 ON l3.parent_id = l2.id
   LEFT JOIN crm_unspsc_codes l4 ON l4.parent_id = l3.id
   LEFT JOIN crm_unspsc_codes l5 ON l5.parent_id = l4.id
   WHERE p.level = 1
   GROUP BY p.code ORDER BY p.code`
);
console.log("6.各大类层级节点数:", JSON.stringify(segLevels, null, 1));

// 7. 单一大类 vs 多大类公告的占比复核（用于统计口径说明）
const [ratio] = await pool.query(
  `SELECT
     COUNT(*) AS classified_total,
     SUM(seg_cnt = 1) AS single_seg,
     SUM(seg_cnt > 1) AS multi_seg,
     ROUND(SUM(seg_cnt > 1) / COUNT(*) * 100, 1) AS multi_pct
   FROM (
     SELECT b.notice_id, COUNT(DISTINCT b.level1_id) AS seg_cnt
     FROM crm_bid_notice_unspsc_codes b
     INNER JOIN crm_bid_notices n ON n.id = b.notice_id
     WHERE ${active} AND ${validSeg}
     GROUP BY b.notice_id
   ) t`
);
console.log("7.单类/多类占比:", JSON.stringify(ratio[0]));

await pool.end();
