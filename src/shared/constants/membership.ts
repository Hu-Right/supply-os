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
 * 权益矩阵里的资格条件查看权益码（shared 层 SSOT）。
 * 前端只读 gates 的键，不自行发明门控；服务端 benefit-matrix 也从这里引用。
 */
export const QUALIFICATION_ACCESS_BENEFIT = "qualification_access";

