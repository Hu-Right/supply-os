/**
 * 会员 API
 * Membership API functions
 */
import type { MembershipPlan, MembershipStatus } from "../types";
import { api, apiCached } from "@/core/http";

export const fetchMembershipPlans = () =>
  apiCached<MembershipPlan[]>("/api/membership/plans");

export const fetchMembershipStatus = (userKey: string, useCache = false) => {
  const url = `/api/membership/status?user_key=${encodeURIComponent(userKey)}`;
  return useCache
    ? apiCached<MembershipStatus>(url)
    : api<MembershipStatus>(url);
};
