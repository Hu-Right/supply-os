/**
 * 会员等级常量
 * Membership Tier Constants
 *
 * @module shared/constants/membership
 * @description 统一全库散落的会员等级字符串字面量（"free" / "vip"），
 *              避免新增等级时需要逐个文件搜索替换。
 */

export const MEMBERSHIP_TIER = {
  /** 免费用户 */
  FREE: "free",
  /** VIP 会员 */
  VIP: "vip",
} as const;

export type MembershipTier = (typeof MEMBERSHIP_TIER)[keyof typeof MEMBERSHIP_TIER];

/**
 * 从套餐名称提取等级标签（AppHeader 等展示用，原 membership-upgrade/utils 双实现收敛于此）。
 * V2 套餐名（个人体验版/个人标准版/个人专业版/企业年度会员）与 V1 遗留名
 * （标讯个人会员、标讯企业会员-旗舰版、企业至尊年卡等）都能得到合理标签：
 * - 含连字符：取末段（"标讯企业会员-旗舰版" → "旗舰版"）
 * - 已以"版"结尾：原样返回（"个人专业版" → "个人专业版"）
 * - 其余：去"标讯"前缀、去"会员/年卡"后缀再加"版"（"标讯个人会员"→"个人版"，"企业年度会员"→"企业版"）
 * 不匹配时兜底 VIP。
 */
export function extractTierLabel(planName: string | null | undefined): string {
  if (!planName) return "VIP";
  if (planName.includes("-")) {
    const suffix = planName.split("-").pop()?.trim();
    if (suffix) return suffix;
  }
  const core = planName.replace(/^标讯/, "").trim();
  if (!core) return "VIP";
  if (core.endsWith("版")) return core;
  const stripped = core.replace(/(会员|年卡)$/, "");
  if (stripped.startsWith("企业")) return "企业版";
  return `${stripped}版`;
}
