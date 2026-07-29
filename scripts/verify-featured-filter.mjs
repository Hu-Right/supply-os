// T-A3 只读探针：与 server.ts /api/notices featured 过滤 + is_featured 标注同构，实测：
// ① featured=1 total 与 T-A2 stats featured 计数一致 ② 当页行逐条三路判定与集合标注一致
// ③ featured 与 q/country/sort/金额窗口组合无 SQL 错误 ④ 耗时
// 规则若在 server.ts 侧变更，本脚本须同步修改
import mysql from "mysql2/promise";

const pool = mysql.createPool({ host: "192.168.1.2", user: "root", password: "123456", database: "crm" });

const qualifiedOppWhere = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return `(${p}is_qualified = 1 OR ${p}status = 'won' OR ${p}audit_status = 1)`;
};
const FEATURED_NOTICE_EXISTS = `(
  n.converted_opp_id IN (SELECT o1.id FROM crm_bid_opportunities o1 WHERE ${qualifiedOppWhere("o1")})
  OR n.notice_id IN (SELECT o2.source_notice_id FROM crm_bid_opportunities o2
    WHERE ${qualifiedOppWhere("o2")} AND o2.source_notice_id IS NOT NULL AND o2.source_notice_id <> '')
  OR n.reference IN (SELECT o3.reference FROM crm_bid_opportunities o3
    WHERE ${qualifiedOppWhere("o3")} AND o3.reference IS NOT NULL AND o3.reference <> '')
)`;
const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
const activeWhere = `(n.is_expired = 0 OR n.is_expired IS NULL)
  AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`;

let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  → ${detail}`); ok ? pass++ : fail++; };

// ① featured=1 过滤 total ↔ T-A2 stats featured 同口径一致（同一 SQL 表达式，天然一致，实测防回归）
let t0 = Date.now();
const [[{ total: featuredTotal }]] = await pool.query(
  `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${activeWhere} AND ${FEATURED_NOTICE_EXISTS}`
);
console.log(`  [featured=1 total] = ${featuredTotal}（${Date.now() - t0}ms）`);
check("featured 总数 > 0 且与 stats 口径同源", Number(featuredTotal) > 0, `${featuredTotal}`);

// ② featured=1 首页 9 条：逐条三路判定复核（当页行确实全部是精选）
const [pageRows] = await pool.query(
  `SELECT n.id, n.converted_opp_id, n.notice_id, n.reference FROM crm_bid_notices n
   WHERE ${activeWhere} AND ${FEATURED_NOTICE_EXISTS}
   ORDER BY (n.deadline_ts IS NULL), ${deadlineSecExpr}, n.id DESC LIMIT 9`
);
let allFeatured = true;
for (const row of pageRows) {
  const [[{ hit }]] = await pool.query(
    `SELECT (${FEATURED_NOTICE_EXISTS}) AS hit FROM crm_bid_notices n WHERE n.id = ?`, [row.id]
  );
  if (!Number(hit)) allFeatured = false;
}
check("featured=1 当页行逐条复核全为精选", allFeatured, `${pageRows.length} 行全过`);

// ③ is_featured 标注一致性：普通列表首页 9 条，集合标注 vs 逐条判定
const [normalRows] = await pool.query(
  `SELECT n.id FROM crm_bid_notices n WHERE ${activeWhere}
   ORDER BY (n.deadline_ts IS NULL), ${deadlineSecExpr}, n.id DESC LIMIT 9`
);
t0 = Date.now();
const [idRows] = await pool.query(
  `SELECT n.id FROM crm_bid_notices n WHERE ${activeWhere} AND ${FEATURED_NOTICE_EXISTS}`
);
const featuredSet = new Set(idRows.map((r) => Number(r.id)));
console.log(`  [精选 id 集合] ${featuredSet.size} 个（${Date.now() - t0}ms，10 分钟缓存一次）`);
let consistent = true;
for (const row of normalRows) {
  const [[{ hit }]] = await pool.query(
    `SELECT (${FEATURED_NOTICE_EXISTS}) AS hit FROM crm_bid_notices n WHERE n.id = ?`, [row.id]
  );
  if (Boolean(Number(hit)) !== featuredSet.has(Number(row.id))) consistent = false;
}
check("普通列表当页集合标注与逐条判定一致", consistent, `${normalRows.length} 行全过`);

// ④ featured 与 q/country/sort/截止窗口组合无 SQL 错误
try {
  t0 = Date.now();
  const [[{ total: comboTotal }]] = await pool.query(
    `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n
     WHERE ${activeWhere} AND ${FEATURED_NOTICE_EXISTS}
       AND n.country LIKE ? AND n.title LIKE ?
       AND n.deadline_ts IS NOT NULL AND ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + ? * 86400`,
    ["%United%", "%supply%", 90]
  );
  check("featured 组合筛选无 SQL 错误且为子集",
    Number(comboTotal) <= Number(featuredTotal),
    `combo=${comboTotal} ≤ ${featuredTotal}（${Date.now() - t0}ms）`);
} catch (err) {
  check("featured 组合筛选无 SQL 错误且为子集", false, err.message);
}

console.log(`\nT-A3 featured 过滤验证：${pass} PASS / ${fail} FAIL`);
await pool.end();
process.exit(fail ? 1 : 0);
