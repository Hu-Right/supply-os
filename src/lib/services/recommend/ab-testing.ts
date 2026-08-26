/**
 * A/B 测试分桶服务
 * A/B Testing Bucket Service
 *
 * @module server/services/recommend/ab-testing
 * @description T-B10 A/B 分桶（本地差异 #15：B.5）
 *              FNV-1a 32 位稳定哈希 % 100：同一 user_key 桶恒定（纯函数，跨请求/重启/进程一致）。
 *              RECO_AB_TREATMENT_PCT 环境变量控放量（0~100 整数，默认 0 = 全 control = 实验默认关闭；
 *              改回 0 即一键回退）。treatment 桶当前实验特性 = T-B7 per-user 权重档案生效。
 *              A/B 放量属线上动作，调整环境变量须经用户明确确认。
 */

/** A/B 测试 treatment 组百分比（0-100，默认 0 = 全 control） */
export const AB_TREATMENT_PCT = Math.min(
  100,
  Math.max(0, Math.floor(Number(process.env.RECO_AB_TREATMENT_PCT || 0)) || 0),
);

/**
 * FNV-1a 32 位哈希（纯函数，跨请求/重启/进程一致）
 */
const fnv1a32 = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

/**
 * 获取用户 A/B 测试分桶
 *
 * @param userKey - 用户标识
 * @returns "control" 或 "treatment"
 */
export const recoVariant = (userKey: string): "control" | "treatment" =>
  AB_TREATMENT_PCT > 0 && fnv1a32(userKey) % 100 < AB_TREATMENT_PCT ? "treatment" : "control";
