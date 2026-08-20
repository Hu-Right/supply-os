/**
 * 会员 API — 全站唯一封装（#12 双封装合并，2026-08-20）
 * Membership API — single implementation for the whole app
 *
 * @description features/membership/api.ts 已改为委托至本文件，
 *              会员套餐/状态/升级预览的网络请求以本文件为单一事实源。
 */
import type { MembershipPlan, MembershipStatus } from "../types";
import { api, apiCached } from "@/core/http";

export const fetchMembershipPlans = () =>
  apiCached<MembershipPlan[]>("/api/membership/plans");

// B1 legacy 退役（2026-08-19）：user_key 兜底参数已删除，身份由 JWT 承载（api() 自动携带）
export const fetchMembershipStatus = (useCache = false) => {
  return useCache
    ? apiCached<MembershipStatus>("/api/membership/status")
    : api<MembershipStatus>("/api/membership/status");
};
