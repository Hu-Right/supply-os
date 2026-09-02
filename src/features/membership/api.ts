/**
 * 会员 API — 向后兼容 re-export（ARCH-P1b 层级归正，2026-08-31）
 * Membership API — Backward-compatible re-export
 *
 * @module features/membership/api
 * @description ARCH-P1b（2026-08-31）：权威实现已迁至 core/api/membership.ts，
 *              本文件改为 re-export 保持存量导入路径兼容。
 *              新代码应直接从 @/core/api/membership 导入。
 */
export type { MembershipPlan, MembershipStatus, UpgradePreview } from "@/core/api/membership";
export {
  fetchMembershipPlans,
  fetchPlans,
  fetchMembershipStatus,
  fetchUpgradePreview,
} from "@/core/api/membership";
