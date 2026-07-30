/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";

export function createMembershipRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  router.get("/api/membership/plans", async (_req, res) => {
    try {
      const [rows] = await dbPool.query(
        `SELECT plan_code, name, description, price, currency, duration_days, unlock_quota, free_quota, plan_type
         FROM crm_membership_plans
         WHERE is_active = 1
         ORDER BY sort_order, id`
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/membership/status", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原不做 trim/lower）
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const [freePlanRows] = await dbPool.query(
        "SELECT free_quota FROM crm_membership_plans WHERE plan_code = 'free' LIMIT 1"
      );
      const freeQuota = Number((freePlanRows as any[])[0]?.free_quota || 3);
      const [freeRows] = await dbPool.query(
        "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type = 'free'",
        [userKey]
      );
      const freeUsed = Number((freeRows as any[])[0]?.total || 0);
      const [subs] = await dbPool.query(
        `SELECT plan_code, status, started_at, expires_at
         FROM crm_user_subscriptions
         WHERE user_key = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY id DESC`,
        [userKey]
      );
      const [paidUnlocks] = await dbPool.query(
        "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type IN ('single','subscription')",
        [userKey]
      );
      const [entitlements] = await dbPool.query(
        `SELECT id, plan_code, quota_total, quota_used, (quota_total - quota_used) AS quota_remaining, expires_at
         FROM crm_user_entitlements
         WHERE user_key = ?
           AND status = 'active'
           AND quota_total > quota_used
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY expires_at IS NULL DESC, expires_at ASC, id ASC`,
        [userKey]
      );
      const paidQuotaTotal = (entitlements as any[]).reduce((sum, item) => sum + Number(item.quota_total || 0), 0);
      const paidQuotaUsed = (entitlements as any[]).reduce((sum, item) => sum + Number(item.quota_used || 0), 0);
      const paidQuotaRemaining = (entitlements as any[]).reduce((sum, item) => sum + Number(item.quota_remaining || 0), 0);
      res.json({
        user_key: userKey,
        membership_tier: (subs as any[]).length > 0 || paidQuotaRemaining > 0 ? "vip" : "free",
        free_quota: freeQuota,
        free_used: freeUsed,
        free_remaining: Math.max(0, freeQuota - freeUsed),
        paid_unlocks: Number((paidUnlocks as any[])[0]?.total || 0),
        paid_quota_total: paidQuotaTotal,
        paid_quota_used: paidQuotaUsed,
        paid_quota_remaining: paidQuotaRemaining,
        active_subscriptions: subs,
        entitlements,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
