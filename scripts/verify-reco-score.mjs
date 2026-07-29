// 只读实测：B.2.2 加权评分（第四批 #9）——与 /api/notices/recommended 新逻辑同构
// 对比旧逻辑（code 串撞 levelN_id + match_score 排序）与新逻辑（code_id 召回 + reco_score 排序）
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
});

const userKey = process.argv[2] || "1403618157@qq.com";
const [interestRows] = await conn.query(
  `SELECT code, level, MAX(code_id) AS code_id, SUM(weight) AS weight, MAX(COALESCE(updated_at, created_at)) AS last_update
   FROM crm_user_interest_codes WHERE user_key = ?
   GROUP BY code, level ORDER BY weight DESC, last_update DESC LIMIT 80`,
  [userKey]
);
console.log(`用户 ${userKey}，兴趣码 ${interestRows.length} 条`);

const DEPTH_FACTOR = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 };
const HALF_LIFE_DAYS = 90;
const now = Date.now();
const significantPrefix = (code) => {
  let s = code;
  while (s.length > 2 && s.length % 2 === 0 && s.endsWith("00")) s = s.slice(0, -2);
  return s;
};
const scoredCodes = [];
let interestTotal = 0;
const recallIdsByLevel = { 2: [], 3: [], 4: [], 5: [] };
const recallLikePrefixes = new Set();
for (const row of interestRows) {
  const level = Math.min(5, Math.max(1, Number(row.level || 1)));
  const code = String(row.code || "").trim();
  if (!code) continue;
  const prefix = significantPrefix(code);
  if (level >= 2) {
    const codeId = Number(row.code_id || 0);
    if (codeId > 0) recallIdsByLevel[level].push(codeId);
    else if (prefix.length >= 4) recallLikePrefixes.add(prefix);
  }
  const lastMs = row.last_update ? new Date(row.last_update).getTime() : now;
  const ageDays = Math.max(0, (now - lastMs) / 86400000);
  const decayed = Number(row.weight || 0) * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  if (decayed <= 0) continue;
  interestTotal += decayed;
  const depth = Math.min(4, Math.max(1, prefix.length / 2));
  scoredCodes.push({ prefix, weighted: decayed * (DEPTH_FACTOR[depth] ?? 1.0) });
}

const clauses = [];
const params = [];
for (const level of [2, 3, 4, 5]) {
  const ids = [...new Set(recallIdsByLevel[level])];
  if (!ids.length) continue;
  clauses.push(`b.level${level}_id IN (${ids.map(() => "?").join(",")})`);
  params.push(...ids);
}
for (const prefix of recallLikePrefixes) {
  clauses.push(`b.code LIKE ?`);
  params.push(`${prefix}%`);
}
console.log(`召回子句 ${clauses.length} 条（LIKE 兜底 ${recallLikePrefixes.size} 个），评分码 ${scoredCodes.length} 个，分母 ${interestTotal.toFixed(2)}`);

const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
const activeWhere = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`;
const bridgeWhere = clauses.map((c) => `(${c})`).join(" OR ");

let t = Date.now();
const [countRows] = await conn.query(
  `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n
   INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.id
   WHERE (${bridgeWhere}) AND ${activeWhere}`,
  params
);
console.log(`新召回 total（未过期）: ${countRows[0].total}（${Date.now() - t}ms）`);

const scoreParams = [];
const matchWeightExpr = scoredCodes.length
  ? `(${scoredCodes.map(() => "MAX(b.code LIKE ?) * ?").join(" + ")})`
  : "0";
for (const item of scoredCodes) scoreParams.push(`${item.prefix}%`, item.weighted);
const denominator = interestTotal > 0 ? interestTotal : 1;
const urgencyExpr = `CASE
   WHEN n.deadline_ts IS NULL THEN 0.5
   WHEN ${deadlineSecExpr} < UNIX_TIMESTAMP(NOW()) + 7 * 86400 THEN 0.6
   WHEN ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + 30 * 86400 THEN 1.0
   WHEN ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + 90 * 86400 THEN 0.8
   ELSE 0.6
 END`;
const recoScoreExpr = `ROUND(0.5 * LEAST(1, ${matchWeightExpr} / ?) + 0.15 * (${urgencyExpr}) + 0.175, 6)`;

t = Date.now();
const [rows] = await conn.query(
  `SELECT n.id, n.title, n.country, n.deadline, COUNT(DISTINCT b.code) AS match_score, ${recoScoreExpr} AS reco_score
   FROM crm_bid_notices n
   INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.id
   WHERE (${bridgeWhere}) AND ${activeWhere}
   GROUP BY n.id
   ORDER BY reco_score DESC, (n.deadline_ts IS NULL), ${deadlineSecExpr}, n.id DESC
   LIMIT 9`,
  [...scoreParams, denominator, ...params]
);
console.log(`新排序首页（${Date.now() - t}ms）:`);
for (const r of rows) {
  console.log(`  reco=${r.reco_score} match=${r.match_score} ddl=${r.deadline || "-"} [${r.country}] ${String(r.title).slice(0, 50)}`);
}

// 对照：旧逻辑（code 串撞 levelN_id）
const oldByLevel = { 2: [], 3: [], 4: [] };
for (const row of interestRows) {
  const lv = Math.min(4, Math.max(1, Number(row.level || 1)));
  if (lv >= 2) oldByLevel[lv].push(String(row.code));
}
const oldClauses = [];
const oldParams = [];
for (const lv of [2, 3, 4]) {
  const codes = [...new Set(oldByLevel[lv])];
  if (!codes.length) continue;
  oldClauses.push(`b.level${lv}_id IN (${codes.map(() => "?").join(",")})`);
  oldParams.push(...codes);
}
t = Date.now();
const [oldCount] = await conn.query(
  `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n
   INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.id
   WHERE (${oldClauses.map((c) => `(${c})`).join(" OR ")}) AND ${activeWhere}`,
  oldParams
);
console.log(`旧召回 total（对照，语义错误的巧合命中）: ${oldCount[0].total}（${Date.now() - t}ms）`);

await conn.end();
