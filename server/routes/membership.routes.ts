/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { extractTierLabel, previewUpgrade } from "../services/membership-upgrade";

export function createMembershipRouter(ctx: AppContext): Router {
  const router = Router();
  const membershipRepo = ctx.user.membershipRepo;

  router.get("/api/membership/plans", asyncHandler(async (_req, res) => {
    const rows = await membershipRepo.findActivePlans();
    res.setHeader("Cache-Control", "no-store");
    res.json(rows);
  }));

  router.get("/api/membership/status", requireAuth, asyncHandler(async (req, res) => {
    const userKey = req.userKey || "";
    if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

    const freeQuota = await membershipRepo.getFreeQuota();
    const freeUsed = await membershipRepo.countFreeUnlocks(userKey);
    const subs = await membershipRepo.findActiveSubscriptions(userKey);
    const paidUnlocks = await membershipRepo.countPaidUnlocks(userKey);
    const entitlements = await membershipRepo.findActiveEntitlements(userKey);
    const paidQuotaTotal = entitlements.reduce((sum, item) => sum + Number(item.quota_total || 0), 0);
    const paidQuotaUsed = entitlements.reduce((sum, item) => sum + Number(item.quota_used || 0), 0);
    const entitlementRemaining = entitlements.reduce((sum, item) => sum + Number(item.quota_remaining || 0), 0);
    // 订阅配额：从活跃订阅的 plan unlock_quota 汇总，减去已使用的付费解锁次数
    const subscriptionQuota = subs.reduce((sum, sub) => sum + (Number(sub.unlock_quota) || 0), 0);
    const subscriptionRemaining = Math.max(0, subscriptionQuota - paidUnlocks);
    // 总付费剩余 = 单次卡剩余 + 订阅剩余
    const paidQuotaRemaining = entitlementRemaining + subscriptionRemaining;

    // 当前最优周期性套餐（供升级判断与 VIP 等级标签展示）
    const currentBest = await membershipRepo.findCurrentBestPlan(userKey);

    res.json({
      user_key: userKey,
      membership_tier: subs.length > 0 || paidQuotaRemaining > 0 ? "vip" : "free",
      free_quota: freeQuota,
      free_used: freeUsed,
      free_remaining: Math.max(0, freeQuota - freeUsed),
      paid_unlocks: paidUnlocks,
      paid_quota_total: paidQuotaTotal + subscriptionQuota,
      paid_quota_used: paidQuotaUsed,
      paid_quota_remaining: paidQuotaRemaining,
      current_plan_code: currentBest?.plan_code ?? null,
      current_plan_name: currentBest?.plan_name ?? null,
      current_plan_tier_label: currentBest ? extractTierLabel(currentBest.plan_name) : null,
      current_plan_price: currentBest ? Number(currentBest.price) : null,
      active_subscriptions: subs,
      entitlements,
    });
  }));

  // 升级预览：补差价、次数保留、有效期追溯（基于数据库实际启用套餐）
  router.get("/api/membership/upgrade/preview", requireAuth, asyncHandler(async (req, res) => {
    const userKey = req.userKey || "";
    if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
    const targetPlanCode = String(req.query.target_plan_code || "").trim();
    if (!targetPlanCode) return res.status(400).json({ error: "TARGET_PLAN_REQUIRED" });
    const result = await previewUpgrade(membershipRepo, userKey, targetPlanCode);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  }));

  return router;
}
