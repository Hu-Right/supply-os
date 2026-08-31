/**
 * 会员 API — re-export（ARCH-P1b 层级归正，2026-08-31）
 * Membership API — re-export from canonical location
 *
 * @description ARCH-P1b：权威实现已迁至 core/api/membership.ts，
 *              本文件改为 re-export，维持 procurement/api/index.ts 的导出路径。
 */
export {
  fetchMembershipPlans,
  fetchMembershipStatus,
} from "@/core/api/membership";
