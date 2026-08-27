/**
 * 会员套餐升级服务
 * Membership Upgrade Service
 *
 * @module server/services/membership-upgrade
 * @description 升级预览（差价/次数保留/有效期追溯计算）与等级标签提取。
 *              全部基于数据库运行时数据判断，不硬编码套餐列表。
 */
import "server-only";
import type { MembershipRepo } from "../repos/membership.repo";

/** 升级预览结果 */
export interface UpgradePreviewResult {
  can_upgrade: boolean;
  reason: string | null;
  current_plan: {
    plan_code: string;
    name: string;
    price: number;
    unlock_quota: number;
    started_at: string | null;
    expires_at: string | null;
  } | null;
  target_plan: {
    plan_code: string;
    name: string;
    price: number;
    unlock_quota: number;
  } | null;
  quota_used: number;
  price_difference: number;
  remaining_after_upgrade: number;
  expires_at_unchanged: boolean;
}

/**
 * 从套餐名称提取等级标签（个人版/基础版/旗舰版/至尊版），不匹配时兜底 VIP。
 * - 含连字符：取末段（如 "标讯企业会员-旗舰版" → "旗舰版"）
 * - 不含连字符：去 "标讯" 前缀与 "会员" 后缀再加 "版"（如 "标讯个人会员" → "个人版"）
 */
export function extractTierLabel(planName: string | null | undefined): string {
  if (!planName) return "VIP";
  if (planName.includes("-")) {
    const suffix = planName.split("-").pop()?.trim();
    if (suffix) return suffix;
  }
  const core = planName.replace(/^标讯/, "").replace(/会员$/, "").trim();
  if (core) return `${core}版`;
  return "VIP";
}

/**
 * 预览会员升级（补差价、次数保留、有效期追溯）
 * 校验规则全部基于数据库实际启用的套餐，不硬编码。
 */
export async function previewUpgrade(
  membershipRepo: MembershipRepo,
  userKey: string,
  targetPlanCode: string,
): Promise<UpgradePreviewResult> {
  const empty: UpgradePreviewResult = {
    can_upgrade: false,
    reason: null,
    current_plan: null,
    target_plan: null,
    quota_used: 0,
    price_difference: 0,
    remaining_after_upgrade: 0,
    expires_at_unchanged: true,
  };

  // 目标套餐（仅限激活）
  const targetPlan = await membershipRepo.findPlanByCode(targetPlanCode);
  if (!targetPlan) return { ...empty, reason: "TARGET_PLAN_NOT_FOUND" };
  if (Number(targetPlan.unlock_quota || 0) <= 0) return { ...empty, reason: "TARGET_PLAN_NOT_UPGRADABLE" };

  // 当前最优周期性套餐
  const current = await membershipRepo.findCurrentBestPlan(userKey);
  if (!current) return { ...empty, reason: "NO_ACTIVE_PLAN" };
  if (current.plan_code === targetPlanCode) return { ...empty, reason: "ALREADY_ON_TARGET_PLAN" };
  if (Number(targetPlan.price) <= Number(current.price)) return { ...empty, reason: "CANNOT_DOWNGRADE" };

  const priceDifference = Math.max(0, Number(targetPlan.price) - Number(current.price));
  const quotaUsed = Number(current.quota_used || 0);
  const remainingAfterUpgrade = Math.max(0, Number(targetPlan.unlock_quota || 0) - quotaUsed);

  return {
    can_upgrade: true,
    reason: null,
    current_plan: {
      plan_code: current.plan_code,
      name: current.plan_name,
      price: Number(current.price),
      unlock_quota: Number(current.unlock_quota),
      started_at: current.started_at ? new Date(current.started_at).toISOString() : null,
      expires_at: current.expires_at ? new Date(current.expires_at).toISOString() : null,
    },
    target_plan: {
      plan_code: targetPlan.plan_code,
      name: targetPlan.name,
      price: Number(targetPlan.price),
      unlock_quota: Number(targetPlan.unlock_quota),
    },
    quota_used: quotaUsed,
    price_difference: priceDifference,
    remaining_after_upgrade: remainingAfterUpgrade,
    expires_at_unchanged: true,
  };
}
