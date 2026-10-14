/**
 * 推荐评分层
 * Recommendation scoring: SQL expression construction + amount preference
 *
 * @module server/services/recommend/scoring
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { RecallNode } from "./recall";
import { DEADLINE_SEC_EXPR } from "../../utils/notice-expired";
import { CACHE_TTL_MEDIUM_MS } from "@/shared/constants/time";

// 金额偏好查询缓存
const amountPrefCache = new Map<number, { centerLog: number; active: boolean; expires: number }>();
const AMOUNT_PREF_CACHE_TTL = CACHE_TTL_MEDIUM_MS;

export interface ScoringContext {
  matchWeightExpr: string;
  scoreParams: (string | number)[];
  denominator: number;
  urgencyExpr: string;
  amountExpr: string;
  amountScoreParams: (string | number)[];
  l4HitExpr: string;
  l4Params: string[];
  recoScoreExpr: string;
}

/**
 * 参与打分表达式的落点节点上限。
 * 取 24 的依据分两段，都实测过：
 * - 旧形状（宽表 OR-FIND_IN_SET，temp/probe103，那一列只能全表扫）：主查询耗时几乎线性于
 *   表达式个数 —— 用户 2 用 8/16/24/79 个节点是 2.5s/3.5s/4.5s/9.1s，而首页前 20 行的
 *   得分从 16 个起就不再变化（scoredNodes 已按权重降序，被截掉的都是最弱的兴趣）；
 * - 新形状（读节点码倒排表，探针112 形状 C）：同样按 24 个键实测到 681ms / 847ms，
 *   扫描那一块已经没了，留在表达式里的成本只有聚合本身的 CPU。
 * 两边取同一个上限是为了不借这次换形状顺手改排序信号：被截掉的都是权重最低的兴趣。
 */
const RECO_SCORE_MAX_NODES = 24;

/**
 * 构建评分 SQL 表达式 + 参数
 *
 * 关键分工（2026-10-11 实测过才能定下来）：
 *   收窄候选集 → 读节点码倒排表（`cand.node IN (…)`，走索引）；
 *   算加权命中 → 读宽表 ns.backbone_path 的 FIND_IN_SET。
 * 为什么打分不能一起换成倒排表：倒排读法里 `cand` 只包含谓词集（已按 rootNodes 压到
 * 最浅覆盖集）的那些行。被压掉的深层落点根本不会出现在 cand 的行里，
 * `MAX(cand.node = 深层码)` 永远是 0 ⇒ 最值钱的那部分兴趣分静默归零。
 * 实测（temp/probe117）：改成 `MAX(cand.node = ?)` 打分后，三个真实用户首页前 5 条的
 * reco_score 只剩 1~2 个不同值（兴趣分占归一分母约 0.4%），排序实际退化成只看截止时间。
 * 用回列值不是退回旧形状：扫描已经被 cand 收窄到千级行，剩下的是每行 24 次字符串集内查找
 * （探针110：同一轮里候选 2,326~10,039 行，全表扫要 2.4~3.8s，而候选集内判断不在这个量级）。
 * 另：为什么用 MAX(...) 而不是 SUM：主查询还 JOIN 了码桥表，行数会被乘起来，
 * MAX 对行乘积不敏感（命中就是 1），SUM 会把同一个命中重复计数。
 */
export function buildScoringContext(
  scoredNodes: RecallNode[],
  interestTotal: number,
  wCommodity: number,
  wUrgency: number,
  wAmount: number,
  wNeutral: number,
  amountCenterLog: number,
  amountActive: boolean,
): ScoringContext {
  const use = scoredNodes.slice(0, RECO_SCORE_MAX_NODES);
  // 打分读列值（见上面那段：压集后的深层落点不在 cand 的行里）
  const hit = "FIND_IN_SET(?, ns.backbone_path)";
  const matchWeightExpr = use.length
    ? `(${use.map(() => `MAX(${hit}) * ?`).join(" + ")})` : "0";
  const scoreParams: (string | number)[] = [];
  for (const item of use) scoreParams.push(item.node, item.weighted);
  const denominator = interestTotal > 0 ? interestTotal : 1;

  const urgencyExpr = `CASE
       WHEN n.deadline_sec = 0 THEN 0.5
       WHEN ${DEADLINE_SEC_EXPR} < UNIX_TIMESTAMP(NOW()) + 7 * 86400 THEN 0.6
       WHEN ${DEADLINE_SEC_EXPR} <= UNIX_TIMESTAMP(NOW()) + 30 * 86400 THEN 1.0
       WHEN ${DEADLINE_SEC_EXPR} <= UNIX_TIMESTAMP(NOW()) + 90 * 86400 THEN 0.8
       ELSE 0.6 END`;

  const amountExpr = amountActive
    ? `(CASE WHEN MAX(amc.amount_usd) IS NULL OR MAX(amc.amount_usd) <= 0 THEN 0.5
          ELSE 0.5 + (GREATEST(0, 1 - ABS(LOG10(MAX(amc.amount_usd) + 1) - ?) / 3) - 0.5) * IF(MAX(amc.inferred) = 1, 0.7, 1) END)`
    : "0.5";
  const amountScoreParams = amountActive ? [amountCenterLog] : [];

  // 「L4 命中」按兴趣码自己的精度判（有效位 8 位 = 品目级），与旧实现的
  // prefix.length >= 8 逐字等价；不拿节点层级判，那是树给的可证落点，不是用户兴趣的粒度。
  const l4Nodes = use.filter((item) => item.precision >= 8).map((item) => item.node);
  const l4HitExpr = l4Nodes.length
    ? `MAX(${l4Nodes.map(() => `(${hit})`).join(" OR ")})` : "0";
  const l4Params = l4Nodes;

  const recoScoreExpr = `ROUND(${wCommodity} * LEAST(1, ${matchWeightExpr} / ?) + ${wUrgency} * (${urgencyExpr}) + ${wAmount} * ${amountExpr} + ${wNeutral}, 6)`;

  return { matchWeightExpr, scoreParams, denominator, urgencyExpr, amountExpr, amountScoreParams, l4HitExpr, l4Params, recoScoreExpr };
}

/**
 * 查询金额偏好（带缓存）
 */
export async function getAmountPreference(
  pool: Pool, userId: number,
): Promise<{ centerLog: number; active: boolean }> {
  const cachedAmountPref = amountPrefCache.get(userId);
  if (cachedAmountPref && cachedAmountPref.expires > Date.now()) {
    return { centerLog: cachedAmountPref.centerLog, active: cachedAmountPref.active };
  }
  const [amountPrefRows] = await pool.query(
    `SELECT AVG(LOG10(c.amount_usd + 1)) AS center_log, COUNT(*) AS cnt
     FROM crm_opportunity_unlocks u
     INNER JOIN crm_notice_amount_cache c ON c.notice_id = u.notice_id
     WHERE u.user_id = ? AND u.notice_id IS NOT NULL AND c.amount_usd IS NOT NULL AND c.amount_usd > 0`,
    [userId],
  );
  const centerLog = Number((amountPrefRows as RowDataPacket[])[0]?.center_log || 0);
  const active = Number((amountPrefRows as RowDataPacket[])[0]?.cnt || 0) >= 2;
  amountPrefCache.set(userId, { centerLog, active, expires: Date.now() + AMOUNT_PREF_CACHE_TTL });
  return { centerLog, active };
}

/**
 * 解析权重画像（A/B 变体 + 个人化权重）
 */
export function resolveWeights(
  profileRow: RowDataPacket | null,
  variant: string,
): { wCommodity: number; wUrgency: number; wAmount: number; wNeutral: number; profileStale: boolean } {
  const profile = variant === "treatment" ? profileRow : null;
  const pickWeight = (value: unknown, fallback: number) => {
    const n = Number(value); return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
  };
  const wCommodity = pickWeight(profile?.w_commodity, 0.5);
  const wUrgency = pickWeight(profile?.w_urgency, 0.15);
  const wAmount = pickWeight(profile?.w_amount, 0.1);
  const wNeutral = (pickWeight(profile?.w_agency, 0.15) + pickWeight(profile?.w_geo, 0.1)) * 0.5;
  const profileStale = !profileRow || !profileRow.updated_at ||
    Date.now() - new Date(profileRow.updated_at).getTime() > 24 * 3600 * 1000;
  return { wCommodity, wUrgency, wAmount, wNeutral, profileStale };
}
