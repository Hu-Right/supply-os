/**
 * 会员套餐相关 API 调用
 * Membership Plan API Calls
 *
 * @module features/membership/api
 * @description 封装会员套餐列表拉取和用户状态查询，用于以数据库价格校准前端展示
 *              Encapsulates membership plan fetching and user status query to calibrate display price against DB
 */

import { api } from "@/core/http";
import type { MembershipPlan, MembershipStatus, UpgradePreview } from "@/types";

export type { MembershipPlan, MembershipStatus, UpgradePreview };

/**
 * 拉取启用中的会员套餐列表
 * Fetch active membership plans
 */
export async function fetchPlans(): Promise<MembershipPlan[]> {
  return api<MembershipPlan[]>("/api/membership/plans");
}

/**
 * 查询用户会员状态（配额/订阅/到期）
 * Fetch user membership status (quota/subscription/expiry)
 * B1 legacy 退役（2026-08-19）：user_key 兜底参数已删除，身份由 JWT 承载（api() 自动携带）
 */
export async function fetchMembershipStatus(): Promise<MembershipStatus> {
  return api<MembershipStatus>("/api/membership/status");
}

/**
 * 预览会员升级（差价/次数保留/有效期追溯）
 * Preview membership upgrade (price difference / usage retention / expiry tracing)
 */
export async function fetchUpgradePreview(targetPlanCode: string): Promise<UpgradePreview> {
  return api<UpgradePreview>(
    `/api/membership/upgrade/preview?target_plan_code=${encodeURIComponent(targetPlanCode)}`,
  );
}
