/**
 * 推荐评分层
 * Recommendation scoring: SQL expression construction + amount preference
 *
 * @module server/services/recommend/scoring
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { RecallResult } from "./recall";
import { DEADLINE_SEC_EXPR } from "../../utils/notice-expired";

// 金额偏好查询缓存
const amountPrefCache = new Map<string, { centerLog: number; active: boolean; expires: number }>();
const AMOUNT_PREF_CACHE_TTL = 10 * 60 * 1000;

export interface ScoringContext {
  matchWeightExpr: string;
  scoreParams: any[];
  denominator: number;
  urgencyExpr: string;
  amountExpr: string;
  amountScoreParams: any[];
  l4HitExpr: string;
  l4Params: string[];
  recoScoreExpr: string;
}

/**
 * 构建评分 SQL 表达式 + 参数
 */
export function buildScoringContext(
  scoredCodes: RecallResult[],
  interestTotal: number,
  wUnspsc: number,
  wUrgency: number,
  wAmount: number,
  wNeutral: number,
  amountCenterLog: number,
  amountActive: boolean,
): ScoringContext {
  const matchWeightExpr = scoredCodes.length
    ? `(${scoredCodes.map(() => "MAX(b.code LIKE ?) * ?").join(" + ")})` : "0";
  const scoreParams: any[] = [];
  for (const item of scoredCodes) scoreParams.push(`${item.prefix}%`, item.weighted);
  const denominator = interestTotal > 0 ? interestTotal : 1;

  const urgencyExpr = `CASE
       WHEN n.deadline_ts IS NULL THEN 0.5
       WHEN ${DEADLINE_SEC_EXPR} < UNIX_TIMESTAMP(NOW()) + 7 * 86400 THEN 0.6
       WHEN ${DEADLINE_SEC_EXPR} <= UNIX_TIMESTAMP(NOW()) + 30 * 86400 THEN 1.0
       WHEN ${DEADLINE_SEC_EXPR} <= UNIX_TIMESTAMP(NOW()) + 90 * 86400 THEN 0.8
       ELSE 0.6 END`;

  const amountExpr = amountActive
    ? `(CASE WHEN MAX(amc.amount_usd) IS NULL OR MAX(amc.amount_usd) <= 0 THEN 0.5
          ELSE 0.5 + (GREATEST(0, 1 - ABS(LOG10(MAX(amc.amount_usd) + 1) - ?) / 3) - 0.5) * IF(MAX(amc.inferred) = 1, 0.7, 1) END)`
    : "0.5";
  const amountScoreParams = amountActive ? [amountCenterLog] : [];

  const l4Prefixes = scoredCodes.filter((item) => item.prefix.length >= 8).map((item) => item.prefix);
  const l4HitExpr = l4Prefixes.length
    ? `MAX(${l4Prefixes.map(() => "(b.code LIKE ?)").join(" OR ")})` : "0";
  const l4Params = l4Prefixes.map((prefix) => `${prefix}%`);

  const recoScoreExpr = `ROUND(${wUnspsc} * LEAST(1, ${matchWeightExpr} / ?) + ${wUrgency} * (${urgencyExpr}) + ${wAmount} * ${amountExpr} + ${wNeutral}, 6)`;

  return { matchWeightExpr, scoreParams, denominator, urgencyExpr, amountExpr, amountScoreParams, l4HitExpr, l4Params, recoScoreExpr };
}

/**
 * 查询金额偏好（带缓存）
 */
export async function getAmountPreference(
  pool: Pool, userKey: string,
): Promise<{ centerLog: number; active: boolean }> {
  const cachedAmountPref = amountPrefCache.get(userKey);
  if (cachedAmountPref && cachedAmountPref.expires > Date.now()) {
    return { centerLog: cachedAmountPref.centerLog, active: cachedAmountPref.active };
  }
  const [amountPrefRows] = await pool.query(
    `SELECT AVG(LOG10(c.amount_usd + 1)) AS center_log, COUNT(*) AS cnt
     FROM crm_opportunity_unlocks u
     INNER JOIN crm_notice_amount_cache c ON c.notice_id = u.notice_id
     WHERE u.user_key = ? AND u.notice_id IS NOT NULL AND c.amount_usd IS NOT NULL AND c.amount_usd > 0`,
    [userKey],
  );
  const centerLog = Number((amountPrefRows as RowDataPacket[])[0]?.center_log || 0);
  const active = Number((amountPrefRows as RowDataPacket[])[0]?.cnt || 0) >= 2;
  amountPrefCache.set(userKey, { centerLog, active, expires: Date.now() + AMOUNT_PREF_CACHE_TTL });
  return { centerLog, active };
}

/**
 * 解析权重画像（A/B 变体 + 个人化权重）
 */
export function resolveWeights(
  profileRow: RowDataPacket | null,
  variant: string,
): { wUnspsc: number; wUrgency: number; wAmount: number; wNeutral: number; profileStale: boolean } {
  const profile = variant === "treatment" ? profileRow : null;
  const pickWeight = (value: any, fallback: number) => {
    const n = Number(value); return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
  };
  const wUnspsc = pickWeight(profile?.w_unspsc, 0.5);
  const wUrgency = pickWeight(profile?.w_urgency, 0.15);
  const wAmount = pickWeight(profile?.w_amount, 0.1);
  const wNeutral = (pickWeight(profile?.w_agency, 0.15) + pickWeight(profile?.w_geo, 0.1)) * 0.5;
  const profileStale = !profileRow || !profileRow.updated_at ||
    Date.now() - new Date(profileRow.updated_at).getTime() > 24 * 3600 * 1000;
  return { wUnspsc, wUrgency, wAmount, wNeutral, profileStale };
}
