/**
 * 会员 API — 全站唯一封装（N5 归属归正，2026-08-20）
 * Membership API — Single Source of Truth
 *
 * @module features/membership/api
 * @description N5 归属归正（2026-08-20）：原实现寄生于 features/procurement/api/membership.ts，
 *              现迁回 membership 特性目录，procurement 侧改为 re-export。
 *              会员套餐/状态/升级预览的网络请求以本文件为单一事实源。
 */
import { api, apiCached } from "@/core/http";
import type { MembershipPlan, MembershipStatus, UpgradePreview } from "@/types";

export type { MembershipPlan, MembershipStatus, UpgradePreview };

/**
 * 拉取启用中的会员套餐列表（带内存缓存）
 * force：登录态调用方传 true 跳过缓存——首单资格标记（first_purchase_eligible）
 * 依赖登录态，复用未登录缓存会把两档价卡片同时放出来（2026-08-30 修复）
 */
export const fetchMembershipPlans = (force = false) =>
  apiCached<MembershipPlan[]>("/api/membership/plans", undefined, undefined, force);

/** 兼容别名：fetchPlans = fetchMembershipPlans */
export const fetchPlans = fetchMembershipPlans;

// B1 legacy 退役（2026-08-19）：user_key 兜底参数已删除，身份由 JWT 承载（api() 自动携带）
/** 查询用户会员状态（配额/订阅/到期） */
export const fetchMembershipStatus = (useCache = false) => {
  return useCache
    ? apiCached<MembershipStatus>("/api/membership/status")
    : api<MembershipStatus>("/api/membership/status");
};

/** 预览会员升级（差价/次数保留/有效期追溯） */
export async function fetchUpgradePreview(targetPlanCode: string): Promise<UpgradePreview> {
  return api<UpgradePreview>(
    `/api/membership/upgrade/preview?target_plan_code=${encodeURIComponent(targetPlanCode)}`,
  );
}
