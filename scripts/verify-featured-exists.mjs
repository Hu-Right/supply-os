// T-A1 只读探针：与 server.ts 同构复制精选三路 EXISTS（qualifiedOppWhere / FEATURED_NOTICE_EXISTS），
// 实测：① 三路各自命中量与耗时 ② 合并 OR 的精选总数与耗时 ③ 三路合并 ≥ 单路最大值（口径自洽）
// 规则若在 server.ts 侧变更，本脚本须同步修改
import mysql from "mysql2/promise";

const pool = mysql.createPool({ host: "192.168.1.2", user: "root", password: "123456", database: "crm" });

const qualifiedOppWhere = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return `(${p}is_qualified = 1 OR ${p}status = 'won' OR ${p}audit_status = 1)`;
};

const route1 = `(n.converted_opp_id > 0 AND EXISTS (
  SELECT 1 FROM crm_bid_opportunities fo1
  WHERE fo1.id = n.converted_opp_id AND ${qualifiedOppWhere("fo1")}))`;
const route2 = `(n.notice_id IS NOT NULL AND n.notice_id <> '' AND EXISTS (
  SELECT 1 FROM crm_bid_opportunities fo2
  WHERE fo2.source_notice_id = n.notice_id AND ${qualifiedOppWhere("fo2")}))`;
const route3 = `(n.reference IS NOT NULL AND n.reference <> '' AND EXISTS (
  SELECT 1 FROM crm_bid_opportunities fo3
  WHERE fo3.reference = n.reference AND ${qualifiedOppWhere("fo3")}))`;
// 合并版：三路改非相关 IN 子查询（MySQL 物化一次 + 逐行 hash 查找）。
// 实测教训：OR 连接三路相关 EXISTS 会阻止半连接转换，逐行子查询在 5.5 万行基线上超时；
// IN 物化语义等价（每路独立、仍可短路），与 server.ts FEATURED_NOTICE_EXISTS 同构
const merged = `(
  n.converted_opp_id IN (SELECT o1.id FROM crm_bid_opportunities o1 WHERE ${qualifiedOppWhere("o1")})
  OR n.notice_id IN (SELECT o2.source_notice_id FROM crm_bid_opportunities o2
    WHERE ${qualifiedOppWhere("o2")} AND o2.source_notice_id IS NOT NULL AND o2.source_notice_id <> '')
  OR n.reference IN (SELECT o3.reference FROM crm_bid_opportunities o3
    WHERE ${qualifiedOppWhere("o3")} AND o3.reference IS NOT NULL AND o3.reference <> '')
)`;

// 有效公告基线（与 /api/notices 同构：未过期 + 截止未到期或无截止）
const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
const baseWhere = `(n.is_expired = 0 OR n.is_expired IS NULL)
  AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`;

let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  → ${detail}`); ok ? pass++ : fail++; };

const count = async (label, expr) => {
  const t0 = Date.now();
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${baseWhere} AND ${expr}`
  );
  const ms = Date.now() - t0;
  console.log(`  [${label}] 命中=${total} 耗时=${ms}ms`);
  return { total: Number(total), ms };
};

const r1 = await count("路1 converted_opp_id", route1);
const r2 = await count("路2 source_notice_id", route2);
const r3 = await count("路3 reference", route3);
const all = await count("三路合并 OR", merged);

check("三路合并 ≥ 单路最大值（口径自洽）",
  all.total >= Math.max(r1.total, r2.total, r3.total),
  `合并=${all.total} ≥ max(${r1.total}, ${r2.total}, ${r3.total})`);
check("三路合并 ≤ 三路之和（无凭空多算）",
  all.total <= r1.total + r2.total + r3.total,
  `合并=${all.total} ≤ ${r1.total + r2.total + r3.total}`);
check("合并查询耗时 < 5s（冷查询验收线）", all.ms < 5000, `${all.ms}ms`);

console.log(`\nT-A1 三路 EXISTS 验证：${pass} PASS / ${fail} FAIL`);
await pool.end();
process.exit(fail ? 1 : 0);
