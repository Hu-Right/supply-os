// 只读验证：G.2 搜索 SQL 三级匹配 + F.3 兜底（与 /api/notices 同构，仅 SELECT 不落库）
// 验证点：①编号精确命中置顶 ②原文 LIKE ③中文译文命中 ④deadline 秒/毫秒混存兜底 ⑤country LIKE
import mysql from "mysql2/promise";
const pool = mysql.createPool({ host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2 });

const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
const baseWhere = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`;

try {
  // 取一条有效公告的真实 reference 作精确命中样本
  const [[sample]] = await pool.query(
    `SELECT n.id, n.reference, n.title, n.country FROM crm_bid_notices n
     WHERE ${baseWhere} AND n.reference IS NOT NULL AND n.reference <> '' LIMIT 1`
  );
  console.log("样本:", JSON.stringify(sample));

  const runSearch = async (label, q) => {
    const compactQ = q.replace(/\s+/g, "").toUpperCase();
    const likeQ = `%${q}%`;
    const t0 = Date.now();
    const [rows] = await pool.query(
      `SELECT DISTINCT n.id, n.reference, n.title, n.deadline_ts
       FROM crm_bid_notices n
       LEFT JOIN crm_notice_translations qtr ON qtr.notice_id = n.id AND qtr.lang = 'zh'
       WHERE ${baseWhere}
         AND (UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ? OR n.title LIKE ? OR n.reference LIKE ? OR n.description LIKE ? OR qtr.title_tr LIKE ?)
       ORDER BY (UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ?) DESC, (n.deadline_ts IS NULL), ${deadlineSecExpr}, n.id DESC
       LIMIT 9`,
      [compactQ, likeQ, likeQ, likeQ, likeQ, compactQ]
    );
    console.log(`\n[${label}] q="${q}" 命中${rows.length}条 耗时${Date.now() - t0}ms 首条:`, JSON.stringify(rows[0] || null));
  };

  await runSearch("① 编号精确(加空格干扰)", ` ${String(sample.reference)} `);
  await runSearch("② 原文关键词", String(sample.title || "").split(" ").slice(0, 2).join(" ") || "supply");

  // ③ 中文译文命中：取一条已缓存中文译文的标题词
  const [[tr]] = await pool.query(
    `SELECT tr.notice_id, tr.title_tr FROM crm_notice_translations tr
     JOIN crm_bid_notices n ON n.id = tr.notice_id
     WHERE tr.lang = 'zh' AND tr.title_tr IS NOT NULL AND ${baseWhere} LIMIT 1`
  ).then((r) => (r[0].length ? r : [[null]]));
  if (tr) {
    await runSearch("③ 中文译文", String(tr.title_tr).slice(0, 6));
  } else {
    console.log("\n[③ 中文译文] 库内暂无满足条件的中文译文缓存，跳过（编号搜索兜底符合预期）");
  }

  // ⑤ country LIKE + 日期区间
  const t0 = Date.now();
  const [byCountry] = await pool.query(
    `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n
     WHERE ${baseWhere} AND n.country LIKE ? AND ${deadlineSecExpr} >= UNIX_TIMESTAMP(?) AND ${deadlineSecExpr} <= UNIX_TIMESTAMP(?)`,
    [`%${String(sample.country || "").slice(0, 20)}%`, "2026-07-29 00:00:00", "2026-12-31 23:59:59"]
  );
  console.log(`\n[⑤ 国家+日期区间] country like "${sample.country}" 命中${byCountry[0].total}条 耗时${Date.now() - t0}ms`);
} finally {
  await pool.end();
}
