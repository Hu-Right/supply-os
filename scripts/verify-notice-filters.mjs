// T-B8 只读探针：复刻 /api/notices 多维过滤 SQL（与 server.ts 同构），全参数组合实测：
// ① 各新参数单独生效 ② 全参数组合无 SQL 错误 ③ 过滤结果为无过滤结果的子集 ④ 耗时
import mysql from "mysql2/promise";

const pool = mysql.createPool({ host: "192.168.1.2", user: "root", password: "123456", database: "crm" });

const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";

// 与 server.ts 同构的 WHERE 组装（仅覆盖 T-B8 相关分支）
function buildQuery({ q, country, valueMin, valueMax, deadlineWithinDays, noticeType, sort }) {
  const where = ["(n.is_expired = 0 OR n.is_expired IS NULL)"];
  const params = [];
  let join = "";
  where.push(`(n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`);
  if (q) {
    join += " LEFT JOIN crm_notice_translations qtr ON qtr.notice_id = n.id AND qtr.lang = 'zh'";
    const likeQ = `%${q}%`;
    where.push("(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ? OR n.title LIKE ? OR n.reference LIKE ? OR n.description LIKE ? OR qtr.title_tr LIKE ?)");
    params.push(q.replace(/\s+/g, "").toUpperCase(), likeQ, likeQ, likeQ, likeQ);
  }
  if (country) { where.push("n.country LIKE ?"); params.push(`%${country}%`); }
  if (deadlineWithinDays > 0) {
    where.push(`n.deadline_ts IS NOT NULL AND ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + ? * 86400`);
    params.push(deadlineWithinDays);
  }
  if (noticeType) { where.push("n.notice_type LIKE ?"); params.push(`%${noticeType}%`); }
  if (valueMin || valueMax) {
    join += " INNER JOIN crm_notice_amount_cache vamc ON vamc.notice_id = n.id AND vamc.amount_usd IS NOT NULL";
    if (valueMin) { where.push("vamc.amount_usd >= ?"); params.push(valueMin); }
    if (valueMax) { where.push("vamc.amount_usd <= ?"); params.push(valueMax); }
  }
  const orderSql = sort === "latest" ? "n.id DESC" : `(n.deadline_ts IS NULL), ${deadlineSecExpr}, n.id DESC`;
  return {
    countSql: `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n ${join} WHERE ${where.join(" AND ")}`,
    pageSql: `SELECT DISTINCT n.id, n.deadline_ts, n.notice_type FROM crm_bid_notices n ${join} WHERE ${where.join(" AND ")} ORDER BY ${orderSql} LIMIT 9`,
    params,
  };
}

let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  → ${detail}`); ok ? pass++ : fail++; };
const run = async (label, filters) => {
  const { countSql, pageSql, params } = buildQuery(filters);
  const t0 = Date.now();
  const [[{ total }]] = await pool.query(countSql, params);
  const [rows] = await pool.query(pageSql, params);
  console.log(`  [${label}] total=${total} 当页=${rows.length} 耗时=${Date.now() - t0}ms`);
  return { total: Number(total), rows };
};

// 基线（无过滤）
const base = await run("基线", {});

// ① value_min/value_max 单独生效 + 子集
const val = await run("value 100万~500万 USD", { valueMin: 1_000_000, valueMax: 5_000_000 });
check("金额区间过滤生效且为子集", val.total > 0 && val.total < base.total, `${val.total} ∈ (0, ${base.total})`);

// ② deadline_within_days：7 天 ⊆ 30 天 ⊆ 基线，且当页截止全部在窗口内
const w7 = await run("7 天内截止", { deadlineWithinDays: 7 });
const w30 = await run("30 天内截止", { deadlineWithinDays: 30 });
const nowSec = Math.floor(Date.now() / 1000);
const w7Ok = w7.rows.every((r) => {
  const d = Number(r.deadline_ts) > 100000000000 ? Math.floor(Number(r.deadline_ts) / 1000) : Number(r.deadline_ts);
  return d <= nowSec + 7 * 86400;
});
check("deadline_within_days 单调子集", w7.total <= w30.total && w30.total <= base.total, `7d=${w7.total} ≤ 30d=${w30.total} ≤ 全部=${base.total}`);
check("7 天窗当页行截止全在窗内（折算表达式）", w7Ok, `${w7.rows.length} 行全过`);

// ③ notice_type 过滤
const typ = await run("notice_type=RFQ", { noticeType: "RFQ" });
check("notice_type 过滤生效且为子集", typ.total > 0 && typ.total < base.total, `${typ.total} ∈ (0, ${base.total})`);

// ④ 全参数组合无 SQL 错误（q+country+金额+窗口+类型+latest 排序）
try {
  const combo = await run("全参数组合", {
    q: "supply", country: "United", valueMin: 10_000, valueMax: 50_000_000,
    deadlineWithinDays: 90, noticeType: "tender", sort: "latest",
  });
  check("全参数组合无 SQL 错误", true, `total=${combo.total}（允许 0，语法/参数序正确即过）`);
} catch (err) {
  check("全参数组合无 SQL 错误", false, err.message);
}

console.log(`\nT-B8 多维过滤验证：${pass} PASS / ${fail} FAIL`);
await pool.end();
process.exit(fail ? 1 : 0);
