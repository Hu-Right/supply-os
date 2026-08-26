/**
 * 兴趣码衰减服务
 * Interest Code Decay Service
 *
 * @module server/services/recommend/interest-decay
 * @description 本地差异 #11：T-E3 负反馈强化（E.3）——dismiss 用相对强衰减 ×0.5（乘法在权重通胀下仍有效，
 *              绝对扣减会失效）；GREATEST(0.01) 下限保护，weight 永不降为 ≤0（画像可转向但不清零）。
 *              对该用户展开前缀命中的所有 source 行统一衰减（跨来源同码一并降权）
 */
import { expandUnspscInterestPrefixes } from "../unspsc/index";

/**
 * 衰减用户兴趣码权重
 *
 * @param dbPool - 数据库连接池
 * @param userKey - 用户标识
 * @param snapshot - 公告 UNSPSC 码快照
 * @param factor - 衰减因子（默认 0.5）
 */
export async function decayUserInterestCodes(
  dbPool: any,
  userKey: string,
  snapshot: Array<{ code?: unknown }>,
  factor = 0.5,
): Promise<void> {
  const prefixes = new Set<string>();
  for (const item of snapshot) {
    const rawCode = String(item?.code || "").replace(/\D/g, "").slice(0, 8);
    expandUnspscInterestPrefixes(rawCode).forEach((prefix) => prefixes.add(prefix));
  }
  if (prefixes.size === 0) return;
  const list = Array.from(prefixes);
  await dbPool.execute(
    `UPDATE crm_user_interest_codes
     SET weight = GREATEST(0.01, weight * ?), updated_at = NOW()
     WHERE user_key = ? AND code IN (${list.map(() => "?").join(",")})`,
    [factor, userKey, ...list],
  );
}
