/**
 * 会员状态查询 hook — 向后兼容 re-export
 * Membership Status Hook — Backward-compatible re-export
 *
 * @module features/membership/hooks/useMembershipStatus
 * @description 权威实现已提升至 shared/hooks/useMembershipStatus.ts，
 *              本文件改为 re-export 保持存量导入路径兼容。
 *              新代码应直接从 @/shared/hooks/useMembershipStatus 导入。
 */
export { useMembershipStatus } from "@/shared/hooks/useMembershipStatus";
