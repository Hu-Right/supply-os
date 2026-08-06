/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler } from "../middleware/errorHandler";

export function createMembershipRouter(ctx: AppContext): Router {
  const router = Router();
  const membershipRepo = ctx.membershipRepo;

  // 会员套餐准静态（运营配置后极少变动），服务端内存缓存 10 分钟
  let plansCache: { data: any[]; ts: number } | null = null;
  const PLANS_CACHE_TTL = 10 * 60 * 1000;

  router.get("/api/membership/plans", asyncHandler(async (_req, res) => {
    const now = Date.now();
    if (plansCache && now - plansCache.ts < PLANS_CACHE_TTL) {
      res.setHeader("Cache-Control", "public, max-age=600");
      return res.json(plansCache.data);
    }
    const rows = await membershipRepo.findActivePlans();
    plansCache = { data: rows, ts: now };
    res.setHeader("Cache-Control", "public, max-age=600");
    res.json(rows);
  }));

  router.get("/api/membership/status", asyncHandler(async (req, res) => {
    const userKey = normalizeUserKey(req.query.user_key) || "";
    if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

    const freeQuota = await membershipRepo.getFreeQuota();
    const freeUsed = await membershipRepo.countFreeUnlocks(userKey);
    const subs = await membershipRepo.findActiveSubscriptions(userKey);
    const paidUnlocks = await membershipRepo.countPaidUnlocks(userKey);
    const entitlements = await membershipRepo.findActiveEntitlements(userKey);
    const paidQuotaTotal = entitlements.reduce((sum, item) => sum + Number(item.quota_total || 0), 0);
    const paidQuotaUsed = entitlements.reduce((sum, item) => sum + Number(item.quota_used || 0), 0);
    const paidQuotaRemaining = entitlements.reduce((sum, item) => sum + Number(item.quota_remaining || 0), 0);
    res.json({
      user_key: userKey,
      membership_tier: subs.length > 0 || paidQuotaRemaining > 0 ? "vip" : "free",
      free_quota: freeQuota,
      free_used: freeUsed,
      free_remaining: Math.max(0, freeQuota - freeUsed),
      paid_unlocks: paidUnlocks,
      paid_quota_total: paidQuotaTotal,
      paid_quota_used: paidQuotaUsed,
      paid_quota_remaining: paidQuotaRemaining,
      active_subscriptions: subs,
      entitlements,
    });
  }));

  return router;
}
