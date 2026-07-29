// T-A2 只读探针：与 server.ts /api/notices/stats 同构复制五指标 SQL，实测：
// ① 各指标独立耗时（冷查询 < 5s 验收线） ② 口径自洽（featured ≤ active、bridged ≤ active、gap = active - bridged）
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
const count = async (label, sql) => {
  const t0 = Date.now();
  const [rows] = await pool.query(sql);
  const total = Number(rows[0]?.total || 0);
  const ms = Date.now() - t0;
  console.log(`  [${label}] = ${total}（${ms}ms）`);
  return { total, ms };
};

const t0 = Date.now();
const raw = await count("raw", "SELECT COUNT(*) AS total FROM crm_bid_notices n");
const active = await count("active", `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${activeWhere}`);
const bridged = await count("bridged", `SELECT COUNT(*) AS total FROM crm_bid_notices n
  WHERE ${activeWhere} AND EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id)`);
const featured = await count("featured", `SELECT COUNT(*) AS total FROM crm_bid_notices n
  WHERE ${activeWhere} AND ${FEATURED_NOTICE_EXISTS}`);
const totalMs = Date.now() - t0;
console.log(`  [bridge_gap] = ${active.total - bridged.total}\n  五指标合计耗时 ${totalMs}ms`);

check("active ≤ raw", active.total <= raw.total, `${active.total} ≤ ${raw.total}`);
check("bridged ≤ active", bridged.total <= active.total, `${bridged.total} ≤ ${active.total}`);
check("featured ≤ active", featured.total <= active.total, `${featured.total} ≤ ${active.total}`);
check("五指标冷查询合计 < 5s（验收线）", totalMs < 5000, `${totalMs}ms`);
check("featured 与 T-A1 探针同口径可对账（>0）", featured.total > 0, `${featured.total}`);

console.log(`\nT-A2 stats 五指标验证：${pass} PASS / ${fail} FAIL`);
await pool.end();
process.exit(fail ? 1 : 0);
