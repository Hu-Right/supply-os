/**
 * 会员套餐相关 API 调用 — 委托层
 * Membership Plan API Calls — delegation layer
 *
 * @module features/membership/api
 * @description #12 双封装合并（2026-08-20）：会员请求的网络封装统一收敛至
 *              features/procurement/api/membership.ts（含 useCache 能力），
 *              本文件仅保留命名适配与升级预览封装，维持既有导入路径可用。
 */

import { api } from "@/core/http";
import type { MembershipPlan, MembershipStatus, UpgradePreview } from "@/types";
import {
  fetchMembershipPlans,
  fetchMembershipStatus,
} from "@/features/procurement/api/membership";

export type { MembershipPlan, MembershipStatus, UpgradePreview };

/**
 * 拉取启用中的会员套餐列表
 * Fetch active membership plan list（委托至统一封装）
 */
export async function fetchPlans(): Promise<MembershipPlan[]> {
  return fetchMembershipPlans();
}

/**
 * 查询用户会员状态（配额/订阅/到期）
 * Fetch user membership status（委托至统一封装；身份由 JWT 承载）
 */
export { fetchMembershipStatus };

/**
 * 预览会员升级（差价/次数保留/有效期追溯）
 * Preview membership upgrade (price difference / usage retention / expiry tracing)
 */
export async function fetchUpgradePreview(targetPlanCode: string): Promise<UpgradePreview> {
  return api<UpgradePreview>(
    `/api/membership/upgrade/preview?target_plan_code=${encodeURIComponent(targetPlanCode)}`,
  );
}
