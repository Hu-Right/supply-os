/**
 * 会员等级标签 Hook — 向后兼容 re-export
 * Membership Tier Label Hook — Backward-compatible re-export
 *
 * @module features/membership/hooks/useMembershipTier
 * @description 权威实现已提升至 shared/hooks/useMembershipTier.ts，
 *              本文件改为 re-export 保持存量导入路径兼容。
 *              新代码应直接从 @/shared/hooks/useMembershipTier 导入。
 */
export { useMembershipTier } from "@/shared/hooks/useMembershipTier";
export type { UseMembershipTierReturn } from "@/shared/hooks/useMembershipTier";
