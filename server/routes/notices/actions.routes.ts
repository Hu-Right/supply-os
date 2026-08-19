/**
 * 公告用户动作路由（浏览/解锁/意向/反馈）
 * Notice user action routes (view/unlock/interest/feedback)
 *
 * @module server/routes/notices/actions.routes
 * @description 路由层仅做参数解析、校验与响应构造；业务编排已下沉至
 *              services/notice-actions.ts。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/auth";
import type { RecoFeedbackItem } from "../../repos/notices.repo";
import {
  executeUnlock, processFeedback, submitInterest,
  NoticeNotFoundError, QuotaExceededError,
} from "../../services/notice-actions";

export function createNoticeActionsRouter(ctx: AppContext): Router {
  const router = Router();
  const noticesRepo = ctx.notice.noticesRepo;

  // ── 解锁列表 ──
  // P0-5 安全修复：解锁列表必须 JWT 认证
  router.get("/api/notices/unlocks", requireAuth, asyncHandler(async (req, res) => {
      const userKey = req.userKey || "guest";
      const rows = await noticesRepo.listNoticeUnlocks(userKey);
      res.json(rows);
  }));

  // ── 推荐反馈 ──
  router.post("/api/notices/feedback", requireAuth, asyncHandler(async (req, res) => {
      const userKey = req.userKey || "";
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

      const result = await processFeedback(
        { noticesRepo, dbPool: ctx.dbPool },
        { userKey, sessionId, items },
      );
      res.status(201).json({ success: true, ...result });
  }));

  // ── 浏览计数 ──
  router.post("/api/notices/:id/view", asyncHandler(async (req, res) => {
      const noticeId = Number(req.params.id);
      // B1 legacy 退役（2026-08-19）：浏览流水归属改用 req.userKey（optionalAuth 已 JWT 优先、
      // body.user_key 兜底），未登录保留 guest 语义
      const userKey = req.userKey || "guest";
      await noticesRepo.insertView({
        userKey,
        noticeId,
        ip: req.ip || req.socket?.remoteAddress || "127.0.0.1",
      });
      res.json({ success: true });
  }));

  // ── 解锁 ──
  router.post("/api/notices/:id/unlock", requireAuth, asyncHandler(async (req, res) => {
      const noticeId = Number(req.params.id);
      const userKey = req.userKey || "guest";
      const unlockType = req.body.unlock_type === "subscription" || req.body.unlock_type === "single"
        ? req.body.unlock_type : "free";
      // P2-10 安全修复：解锁价格服务端定价，不再接受前端传入 price
      const price = unlockType === "single" ? Number(req.body.price || 0) : 0;

      try {
        const result = await executeUnlock(
          { noticesRepo, dbPool: ctx.dbPool },
          { userKey, noticeId, unlockType, price },
        );
        if (result.alreadyUnlocked) {
          return res.json({ success: true, alreadyUnlocked: true });
        }
        res.status(201).json({ success: true, unlock_type: result.unlockType });
      } catch (err) {
        if (err instanceof NoticeNotFoundError) {
          return res.status(404).json({ error: "Notice not found" });
        }
        if (err instanceof QuotaExceededError) {
          return res.status(402).json({ error: err.code });
        }
        throw err;
      }
  }));

  // ── 意向 ──
  router.post("/api/notices/:id/interest", requireAuth, asyncHandler(async (req, res) => {
      const noticeId = Number(req.params.id);
      const userKey = req.userKey || "";
      const interestType = req.body.interest_type === "subscribed" ? "subscribed" : "interested";
      const note = String(req.body.note || "").slice(0, 500);
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      try {
        await submitInterest(
          { noticesRepo, dbPool: ctx.dbPool },
          { userKey, noticeId, interestType, note },
        );
        res.status(201).json({ success: true, interest_type: interestType });
      } catch (err) {
        if (err instanceof NoticeNotFoundError) {
          return res.status(404).json({ error: "Notice not found" });
        }
        throw err;
      }
  }));

  return router;
}
