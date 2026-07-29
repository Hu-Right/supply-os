// 只读验证：F.2 召回最低层级门槛（level2+ 才召回）收窄效果 + F.3 兜底在 recommended 的影响
// 与 /api/notices/recommended 同构 SQL，仅 SELECT COUNT，不写库
import mysql from "mysql2/promise";
const pool = mysql.createPool({ host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2 });

const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";

try {
  // 取一个同时有 level1 与 level2+ 兴趣码的真实用户（前缀展开的典型画像）
  const [[user]] = await pool.query(
    `SELECT user_key FROM crm_user_interest_codes
     GROUP BY user_key
     HAVING SUM(level = 1) > 0 AND SUM(level >= 2) > 0
     ORDER BY COUNT(*) DESC LIMIT 1`
  );
  if (!user) {
    console.log("库内暂无带兴趣码的用户，跳过");
    process.exit(0);
  }
  console.log("样本用户:", user.user_key);

  // 与端点同构：top 80 兴趣码按层级分组
  const [interests] = await pool.query(
    `SELECT code, level, SUM(weight) AS weight, MAX(updated_at) AS last_update
     FROM crm_user_interest_codes WHERE user_key = ?
     GROUP BY code, level ORDER BY weight DESC, last_update DESC LIMIT 80`,
    [user.user_key]
  );
  const byLevel = { 1: [], 2: [], 3: [], 4: [] };
  for (const row of interests) {
    const level = Math.min(4, Math.max(1, Number(row.level || 1)));
    if (row.code) byLevel[level].push(String(row.code));
  }
  console.log("兴趣码分布:", Object.fromEntries(Object.entries(byLevel).map(([k, v]) => [k, v.length])));

  const buildWhere = (levels) => {
    const clauses = [];
    const params = [];
    for (const level of levels) {
      const codes = [...new Set(byLevel[level])];
      if (!codes.length) continue;
      clauses.push(`b.level${level}_id IN (${codes.map(() => "?").join(",")})`);
      params.push(...codes);
    }
    return { where: clauses.map((c) => `(${c})`).join(" OR "), params };
  };

  const runCount = async (label, levels, withDeadlineGuard) => {
    const { where, params } = buildWhere(levels);
    if (!where) return console.log(`[${label}] 无可用兴趣码，召回 0`);
    const guard = withDeadlineGuard
      ? ` AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`
      : "";
    const t0 = Date.now();
    const [[row]] = await pool.query(
      `SELECT COUNT(DISTINCT n.id) AS total
       FROM crm_bid_notices n
       INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.id
       WHERE (${where}) AND (n.is_expired = 0 OR n.is_expired IS NULL)${guard}`,
      params
    );
    console.log(`[${label}] 候选池 ${row.total} 条 耗时${Date.now() - t0}ms`);
    return Number(row.total);
  };

  const oldTotal = await runCount("旧召回 level1~4（无 deadline 兜底）", [1, 2, 3, 4], false);
  const newTotal = await runCount("新召回 level2+（含 F.3 兜底）", [2, 3, 4], true);
  const newNoGuard = await runCount("新召回 level2+（不含兜底，用于分离两项贡献）", [2, 3, 4], false);
  if (oldTotal && newTotal != null) {
    console.log(`\n收窄效果: ${oldTotal} → ${newTotal}（F.2 门槛剔除 ${oldTotal - newNoGuard} 条弱相关，F.3 兜底再剔 ${newNoGuard - newTotal} 条过期漏网）`);
  }
} finally {
  await pool.end();
}
