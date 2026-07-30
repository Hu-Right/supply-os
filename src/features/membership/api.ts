/**
 * 会员套餐相关 API 调用
 * Membership Plan API Calls
 *
 * @module features/membership/api
 * @description 封装会员套餐列表拉取，用于以数据库价格校准前端展示（统一走 core/http）
 *              Encapsulates membership plan fetching to calibrate display price against DB
 */

import { api } from "@/core/http";
import type { MembershipPlan } from "@/types";

// 会员套餐类型以全局 `@/types` 为单一事实源，此处 re-export 保持 barrel 兼容。
// Membership plan type shares the single source of truth in `@/types`; re-exported for barrel compatibility.
export type { MembershipPlan };

/**
 * 拉取启用中的会员套餐列表
 * Fetch active membership plans
 */
export async function fetchPlans(): Promise<MembershipPlan[]> {
  return api<MembershipPlan[]>("/api/membership/plans", { cache: "no-store" });
}
