/**
 * 会员套餐相关 API 调用
 * Membership Plan API Calls
 *
 * @module features/membership/api
 * @description 封装会员套餐列表拉取，用于以数据库价格校准前端展示
 *              Encapsulates membership plan fetching to calibrate display price against DB
 */

import { api } from "@/core/http";
import type { MembershipPlan } from "@/types";

export type { MembershipPlan };

/**
 * 拉取启用中的会员套餐列表
 * Fetch active membership plans
 */
export async function fetchPlans(): Promise<MembershipPlan[]> {
  return api<MembershipPlan[]>("/api/membership/plans");
}
