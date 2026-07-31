/**
 * 会员套餐相关 API 调用
 * Membership Plan API Calls
 *
 * @module features/membership/api
 * @description 封装会员套餐列表拉取，用于以数据库价格校准前端展示
 *              Encapsulates membership plan fetching to calibrate display price against DB
 */

import { api } from "@/core/http";

/**
 * 会员套餐（对应 crm_membership_plans）
 * Membership plan (maps to crm_membership_plans)
 */
export type MembershipPlan = {
  plan_code: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  duration_days?: number | null;
  unlock_quota?: number | null;
  free_quota?: number | null;
  plan_type?: string | null;
};

/**
 * 拉取启用中的会员套餐列表
 * Fetch active membership plans
 */
export async function fetchPlans(): Promise<MembershipPlan[]> {
  return api<MembershipPlan[]>("/api/membership/plans");
}
