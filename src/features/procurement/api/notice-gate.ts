/**
 * 公告权益门控档位命名（V2 档位闸门升级引导）
 * Notice entitlement gate tier naming
 *
 * @module features/procurement/api/notice-gate
 * @description 错误文案统一由 @/core/http 的 mapApiError / classifyApiError 承担（含 VIP 档位识别，
 *              返回 kind==='vipGate' 与 requiredRank）。本模块仅保留「档位 → 六语 tier 键」映射，
 *              供升级引导卡 t("aiGateUpgradeSummary", { tier: t(rankToTierKey(rank)) }) 使用。
 *              此前的 gateErrorToken / vipGateMessage / parseVipRank 已并入统一层并移除（不留兼容壳）。
 */

/** 档位 → 六语 tier 键（组件用 t() 取对应语言等级名） */
const RANK_TIER_KEY: Record<number, string> = {
  1: "tierTrial",
  2: "tierStd",
  3: "tierPro",
  4: "tierEnterprise",
};
export function rankToTierKey(rank: number): string {
  return RANK_TIER_KEY[rank] ?? "tierHigher";
}
