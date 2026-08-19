/**
 * 会员 API
 * Membership API functions
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
