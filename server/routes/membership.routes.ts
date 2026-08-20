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
import { resolveMembershipState } from "../services/membership-status";
import { sendError, ApiErrorCode } from "../utils/http-error";

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
    if (!userKey) return sendError(res, 400, ApiErrorCode.USER_REQUIRED, "请先登录");

    // N1 收敛（2026-08-20）：配额/VIP 派生状态一律经唯一端口 resolveMembershipState 计算，
    // 路由层不再自行拼装查询（原三口径分叉见 services/membership-status.ts 头部注释）。
    const state = await resolveMembershipState(membershipRepo, userKey);

    res.json({
      user_key: userKey,
      membership_tier: state.tier,
      free_quota: state.freeQuota,
      free_used: state.freeUsed,
      free_remaining: state.freeRemaining,
      paid_unlocks: state.paidUnlocks,
      paid_quota_total: state.paidQuotaTotal,
      paid_quota_used: state.paidQuotaUsed,
      paid_quota_remaining: state.paidQuotaRemaining,
      current_plan_code: state.currentBest?.plan_code ?? null,
      current_plan_name: state.currentBest?.plan_name ?? null,
      current_plan_tier_label: state.currentBest ? extractTierLabel(state.currentBest.plan_name) : null,
      current_plan_price: state.currentBest ? Number(state.currentBest.price) : null,
      active_subscriptions: state.activeSubscriptions,
      entitlements: state.entitlements,
    });
  }));

  // 升级预览：补差价、次数保留、有效期追溯（基于数据库实际启用套餐）
  router.get("/api/membership/upgrade/preview", requireAuth, asyncHandler(async (req, res) => {
    const userKey = req.userKey || "";
    if (!userKey) return sendError(res, 400, ApiErrorCode.USER_REQUIRED, "请先登录");
    const targetPlanCode = String(req.query.target_plan_code || "").trim();
    if (!targetPlanCode) return sendError(res, 400, ApiErrorCode.TARGET_PLAN_REQUIRED, "请指定目标套餐");
    const result = await previewUpgrade(membershipRepo, userKey, targetPlanCode);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  }));

  return router;
}
