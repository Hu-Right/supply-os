/**
 * 会员 API — re-export（N5 归属归正，2026-08-20）
 * Membership API — re-export from canonical location
 *
 * @description N5 归属归正：权威实现已迁回 features/membership/api.ts，
 *              本文件改为纯 re-export，维持 procurement/api/index.ts 的导出路径。
 */
export {
  fetchMembershipPlans,
  fetchMembershipStatus,
} from "@/features/membership/api";
