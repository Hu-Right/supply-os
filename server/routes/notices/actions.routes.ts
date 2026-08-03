/**
 * 公告用户动作路由（浏览/解锁/意向/反馈）
 * Notice user action routes (view/unlock/interest/feedback)
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { normalizeUserKey } from "../../utils/normalize";
import { normalizeUnspscCodes, persistUserInterestCodes } from "../../services/unspsc";
import { decayUserInterestCodes } from "../../services/recommend";
import type { RecoFeedbackItem } from "../../repos/notices.repo";

import { asyncHandler } from "../../middleware/errorHandler";

export function createNoticeActionsRouter(ctx: AppContext): Router {
  const router = Router();
  const noticesRepo = ctx.noticesRepo;
  const membershipRepo = ctx.membershipRepo;

  // ── 解锁列表 ──
  router.get("/api/notices/unlocks", asyncHandler(async (req, res) => {
      const userKey = normalizeUserKey(req.query.user_key) || "guest";
      const rows = await noticesRepo.listNoticeUnlocks(userKey);
      res.json(rows);
  }));

  // ── 推荐反馈 ──
  router.post("/api/notices/feedback", asyncHandler(async (req, res) => {
      const userKey = normalizeUserKey(req.body.user_key) || "";
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      const sessionId = String(req.body.session_id || "").trim().slice(0, 64);
      if (!sessionId) return res.status(400).json({ error: "SESSION_REQUIRED" });
      const VALID_ACTIONS = new Set([
        "impression", "click", "unlock", "dismiss", "favorite",
        "dwell", "scroll_end", "quick_exit", "revisit",
      ]);
      const rawActions: any[] = Array.isArray(req.body.actions)
        ? req.body.actions : req.body.notice_id ? [req.body] : [];
      if (rawActions.length === 0) return res.status(400).json({ error: "ACTIONS_REQUIRED" });
      if (rawActions.length > 50) return res.status(400).json({ error: "TOO_MANY_ACTIONS", max: 50 });
      const items: RecoFeedbackItem[] = rawActions
        .map((item) => ({
          noticeId: Number(item?.notice_id || 0),
          action: String(item?.action || "").trim(),
          recoScore: Number.isFinite(Number(item?.reco_score)) ? Number(item.reco_score) : null,
          position: Number.isInteger(Number(item?.position)) && Number(item.position) >= 0 ? Number(item.position) : null,
          variant: String(item?.variant || "").trim().slice(0, 20) || null,
          dwellMs: Number.isInteger(Number(item?.dwell_ms)) && Number(item.dwell_ms) > 0 ? Number(item.dwell_ms) : null,
        }))
        .filter((item) => item.noticeId > 0 && VALID_ACTIONS.has(item.action));
      if (items.length === 0) return res.status(400).json({ error: "NO_VALID_ACTIONS" });

      const inserted = await noticesRepo.insertRecoFeedback(userKey, sessionId, items);

      const linkedActions = items.filter((item) =>
        ["click", "favorite", "dismiss", "dwell", "scroll_end", "quick_exit", "revisit"].includes(item.action)
      );
      if (linkedActions.length) {
        const noticeIds = Array.from(new Set(linkedActions.map((item) => item.noticeId)));
        const noticeRows = await noticesRepo.findUnspscSnapshots(noticeIds);
        const snapshotById = new Map<number, any[]>();
        for (const row of noticeRows) snapshotById.set(Number(row.id), normalizeUnspscCodes(row.unspsc_codes));
        for (const item of linkedActions) {
          const snapshot = snapshotById.get(item.noticeId);
          if (!snapshot || snapshot.length === 0) continue;
          if (item.action === "click") await persistUserInterestCodes(ctx.dbPool, userKey, snapshot, "feedback_click", 0.3);
          else if (item.action === "favorite") await persistUserInterestCodes(ctx.dbPool, userKey, snapshot, "feedback_favorite", 0.8);
          else if (item.action === "dismiss") await decayUserInterestCodes(ctx.dbPool, userKey, snapshot, 0.5);
          else if (item.action === "dwell" && (item.dwellMs || 0) >= 30000)
            await persistUserInterestCodes(ctx.dbPool, userKey, snapshot, "feedback_dwell", 0.2);
          else if (item.action === "scroll_end") await persistUserInterestCodes(ctx.dbPool, userKey, snapshot, "feedback_scroll_end", 0.1);
          else if (item.action === "revisit") await persistUserInterestCodes(ctx.dbPool, userKey, snapshot, "feedback_revisit", 0.5);
          else if (item.action === "quick_exit") await decayUserInterestCodes(ctx.dbPool, userKey, snapshot, 0.95);
        }
      }
      res.status(201).json({ success: true, received: items.length, inserted, deduped: items.length - inserted });
  }));

  // ── 浏览计数 ──
  router.post("/api/notices/:id/view", asyncHandler(async (req, res) => {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.body.user_key) || "guest";
      await noticesRepo.insertView({
        userKey,
        noticeId,
        ip: req.ip || req.socket?.remoteAddress || "127.0.0.1",
      });
      res.json({ success: true });
  }));

  // ── 解锁 ──
  router.post("/api/notices/:id/unlock", asyncHandler(async (req, res) => {
      const noticeId = Number(req.params.id);
      const normalizedUserKey = normalizeUserKey(req.body.user_key);
      const userKey = normalizedUserKey || "guest";
      const unlockType = req.body.unlock_type === "subscription" || req.body.unlock_type === "single"
        ? req.body.unlock_type : "free";
      const price = unlockType === "single" ? Number(req.body.price || 19) : 0;
      let consumedEntitlementId: number | null = null;

      if (await noticesRepo.findExistingUnlock(userKey, noticeId)) return res.json({ success: true, alreadyUnlocked: true });

      if (unlockType === "free") {
        const freeQuota = await membershipRepo.getFreeQuota();
        if (await membershipRepo.countFreeUnlocks(userKey) >= freeQuota) {
          return res.status(402).json({ error: "FREE_LIMIT_REACHED" });
        }
      }

      if (unlockType === "subscription" || unlockType === "single") {
        const entitlement = (await membershipRepo.findActiveEntitlements(userKey))[0];
        if (!entitlement) return res.status(402).json({ error: "PAID_QUOTA_REQUIRED" });
        consumedEntitlementId = Number(entitlement.id);
      }

      const notice = await noticesRepo.findById(noticeId);
      if (!notice) return res.status(404).json({ error: "Notice not found" });
      const snapshot = normalizeUnspscCodes(notice.unspsc_codes);

      await noticesRepo.insertUnlock({ userKey, noticeId, unlockType, price, unspscSnapshot: JSON.stringify(snapshot) });
      if (consumedEntitlementId) {
        await noticesRepo.consumeEntitlement(consumedEntitlementId);
      }
      if (normalizedUserKey) {
        await persistUserInterestCodes(ctx.dbPool, userKey, snapshot, "unlock_order", 2.50);
      }
      res.status(201).json({ success: true, unlock_type: unlockType });
  }));

  // ── 意向 ──
  router.post("/api/notices/:id/interest", asyncHandler(async (req, res) => {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.body.user_key) || "";
      const interestType = req.body.interest_type === "subscribed" ? "subscribed" : "interested";
      const note = String(req.body.note || "").slice(0, 500);
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const notice = await noticesRepo.findById(noticeId);
      if (!notice) return res.status(404).json({ error: "Notice not found" });

      await noticesRepo.upsertInterest({ userKey, noticeId, interestType, note });
      const snapshot = normalizeUnspscCodes(notice.unspsc_codes);
      await persistUserInterestCodes(
        ctx.dbPool, userKey, snapshot,
        interestType === "subscribed" ? "subscribe_notice" : "express_interest",
        interestType === "subscribed" ? 2.0 : 1.0
      );
      res.status(201).json({ success: true, interest_type: interestType });
  }));

  return router;
}
