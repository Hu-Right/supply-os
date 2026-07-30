// 只读探针：验证分类筛选与总数统计的差异原因
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

// 1. 桥接表样本行
const [sample] = await pool.query(
  "SELECT notice_id, code, code_id, level1_id, level2_id, level3_id, level4_id FROM crm_bid_notice_unspsc_codes LIMIT 5"
);
console.log("1.桥接表样本:", JSON.stringify(sample, null, 1));

// 2. level1_id 值域
const [dist] = await pool.query(
  "SELECT MIN(level1_id) AS mn, MAX(level1_id) AS mx, COUNT(DISTINCT level1_id) AS dc, SUM(level1_id IS NULL) AS nulls FROM crm_bid_notice_unspsc_codes"
);
console.log("2.level1_id 值域:", JSON.stringify(dist));

// 3. 两位段码在类目表中的记录（buildNoticeUnspscFilter 用 children 的前缀去撞 level1_id）
const [seg] = await pool.query(
  "SELECT id, code, level, parent_id FROM crm_unspsc_codes WHERE code IN ('10','42','80') ORDER BY code"
);
console.log("3.两位段码在 crm_unspsc_codes 中:", JSON.stringify(seg));

// 4. 一级大类 A-J 的记录与其 children
const [roots] = await pool.query(
  "SELECT id, code, title_zh FROM crm_unspsc_codes WHERE code REGEXP '^[A-J]$' ORDER BY code"
);
console.log("4.一级大类 A-J:", JSON.stringify(roots, null, 1));

// 5. 模拟 buildNoticeUnspscFilter：取第一个大类的 children 前缀，按现行 SQL 统计命中数
if (roots.length) {
  for (const root of roots) {
    const [children] = await pool.query(
      "SELECT code FROM crm_unspsc_codes WHERE parent_id = ? ORDER BY code",
      [root.id]
    );
    const prefixes = children
      .map((r) => {
        const digits = String(r.code || "").replace(/\D/g, "").slice(0, 8);
        if (!digits) return "";
        for (let len = 8; len > 2; len -= 2) {
          if (digits.slice(len - 2, len) !== "00") return digits.slice(0, len);
        }
        return digits.slice(0, 2);
      })
      .filter(Boolean);
    if (!prefixes.length) {
      console.log(`5.大类 ${root.code}: children=0, 命中=0`);
      continue;
    }
    const [cnt] = await pool.query(
      `SELECT COUNT(DISTINCT n.id) AS c
       FROM crm_bid_notices n
       INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes
                   WHERE level1_id IN (${prefixes.map(() => "?").join(",")})) f ON f.notice_id = n.id
       WHERE ${active}`,
      prefixes
    );
    console.log(
      `5.大类 ${root.code} (${root.title_zh || ""}): children=${children.length}, 前缀示例=${prefixes.slice(0, 3).join("/")}, 现行SQL命中=${cnt[0].c}`
    );
  }
}

// 6. 对照：如果 level1_id 按"crm_unspsc_codes.id"正确关联，各大类应命中多少
const [correct] = await pool.query(
  `SELECT seg.code AS seg_code, COUNT(DISTINCT b.notice_id) AS c
   FROM crm_bid_notice_unspsc_codes b
   INNER JOIN crm_unspsc_codes seg ON seg.id = b.level1_id
   INNER JOIN crm_bid_notices n ON n.id = b.notice_id
   WHERE ${active}
   GROUP BY seg.code ORDER BY c DESC LIMIT 15`
);
console.log("6.若按 id 正确关联的各段命中TOP15:", JSON.stringify(correct, null, 1));

await pool.end();
