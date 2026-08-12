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
import { requireAuth } from "../../middleware/auth";

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
  // P1-1 修复：使用事务 + 唯一约束防止并发超额解锁（TOCTOU 竞态条件）
  router.post("/api/notices/:id/unlock", requireAuth, asyncHandler(async (req, res) => {
      const noticeId = Number(req.params.id);
      const userKey = req.userKey || "guest";
      const unlockType = req.body.unlock_type === "subscription" || req.body.unlock_type === "single"
        ? req.body.unlock_type : "free";
      const price = unlockType === "single" ? Number(req.body.price || 19) : 0;

      // 快速路径：先检查是否已解锁（无锁，减少事务冲突）
      if (await noticesRepo.findExistingUnlock(userKey, noticeId)) {
        return res.json({ success: true, alreadyUnlocked: true });
      }

      // 获取公告信息（事务外，只读）
      const notice = await noticesRepo.findById(noticeId);
      if (!notice) return res.status(404).json({ error: "Notice not found" });
      const snapshot = normalizeUnspscCodes(notice.unspsc_codes);

      // 使用事务保证配额检查 + 插入的原子性
      const conn = await ctx.dbPool.getConnection();
      let consumedEntitlementId: number | null = null;
      try {
        await conn.beginTransaction();

        // 事务内再次检查（可能并发请求已通过快速路径）
        const [existingRows] = await conn.query(
          "SELECT id FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
          [userKey, noticeId],
        );
        if ((existingRows as any[]).length > 0) {
          await conn.commit();
          return res.json({ success: true, alreadyUnlocked: true });
        }

        // 配额检查（事务内）
        if (unlockType === "free") {
          const [quotaRows] = await conn.query(
            "SELECT free_quota FROM crm_membership_plans WHERE plan_code = 'free' LIMIT 1",
          );
          const freeQuota = Number((quotaRows as any[])[0]?.free_quota || 3);
          const [countRows] = await conn.query(
            "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type = 'free'",
            [userKey],
          );
          const freeUsed = Number((countRows as any[])[0]?.total || 0);
          if (freeUsed >= freeQuota) {
            await conn.rollback();
            return res.status(402).json({ error: "FREE_LIMIT_REACHED" });
          }
        }

        if (unlockType === "subscription" || unlockType === "single") {
          const [entRows] = await conn.query(
            `SELECT id, plan_code, quota_total, quota_used, (quota_total - quota_used) AS quota_remaining, expires_at
             FROM crm_user_entitlements
             WHERE user_key = ? AND status = 'active' AND quota_total > quota_used
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY expires_at IS NULL DESC, expires_at ASC, id ASC LIMIT 1`,
            [userKey],
          );
          const ent = (entRows as any[])[0];
          if (!ent) {
            await conn.rollback();
            return res.status(402).json({ error: "PAID_QUOTA_REQUIRED" });
          }
          consumedEntitlementId = Number(ent.id);
        }

        // 插入解锁记录（唯一约束 uk_user_notice 保证原子性）
        await conn.query(
          `INSERT INTO crm_opportunity_unlocks
            (user_id, user_key, notice_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
           VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, NOW(), ?)`,
          [userKey, userKey, noticeId, unlockType, price, JSON.stringify(snapshot)],
        );

        // 消耗配额
        if (consumedEntitlementId) {
          await conn.query(
            "UPDATE crm_user_entitlements SET quota_used = quota_used + 1, updated_at = NOW() WHERE id = ? AND quota_total > quota_used",
            [consumedEntitlementId],
          );
        }

        await conn.commit();

        // 事务外：更新兴趣码（非关键路径，失败不影响解锁）
        if (userKey !== "guest") {
          await persistUserInterestCodes(ctx.dbPool, userKey, snapshot, "unlock_order", 2.50).catch(() => {});
        }
        res.status(201).json({ success: true, unlock_type: unlockType });
      } catch (err: any) {
        await conn.rollback();
        // 唯一约束冲突 = 并发请求已解锁
        if (err?.code === "ER_DUP_ENTRY") {
          return res.json({ success: true, alreadyUnlocked: true });
        }
        throw err;
      } finally {
        conn.release();
      }
  }));

  // ── 意向 ──
  router.post("/api/notices/:id/interest", requireAuth, asyncHandler(async (req, res) => {
      const noticeId = Number(req.params.id);
      const userKey = req.userKey || "";
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
