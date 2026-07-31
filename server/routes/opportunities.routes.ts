/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { type UnspscCodeRow, normalizeUnspscCodes } from "../services/unspsc";
import {
  NOTICE_TRANSLATION_LANGS, pendingNoticeTranslations, translateNoticeViaChain,
} from "../services/notice-translation";

export function createOpportunitiesRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  router.get("/api/opportunities", async (req, res) => {
    try {
      const codeId = Number(req.query.code_id || req.query.industry_id || 0);
      const where: string[] = ["(o.is_expired = 0 OR o.is_expired IS NULL)"];
      const params: any[] = [];
      let join = "";

      if (codeId) {
        const [codeRows] = await dbPool.query(
          "SELECT id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
          [codeId]
        );
        const code = (codeRows as UnspscCodeRow[])[0];
        if (code) {
          join = "INNER JOIN crm_bid_opportunity_unspsc_codes boc ON boc.opportunity_id = o.id";
          where.push(`boc.level${code.level}_id = ?`);
          params.push(code.id);
        }
      }

      const [rows] = await dbPool.query(
        `SELECT DISTINCT
           o.id,
           o.title,
           o.reference,
           o.notice_type,
           o.agency,
           o.country,
           o.deadline,
           o.deadline_ts,
           o.estimated_value,
           o.budget,
           o.description,
           o.industry,
           o.unspsc_codes,
           o.source_url,
           o.unlock_count,
           o.view_count
         FROM crm_bid_opportunities o
         ${join}
         WHERE ${where.join(" AND ")}
         ORDER BY COALESCE(o.deadline_ts, 9999999999999), o.id DESC
         LIMIT 80`,
        params
      );

      res.json(
        (rows as any[]).map((row) => ({
          ...row,
          unspsc_codes: normalizeUnspscCodes(row.unspsc_codes),
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/opportunities/unlocks", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || "guest"; // 本地差异 #7：F.1 归一化收敛（读侧保留 guest 兜底）
      const [rows] = await dbPool.query(
        "SELECT opportunity_id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? ORDER BY unlocked_at DESC",
        [userKey]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── 精选数据按需翻译：镜像 /api/notices/:id/translation，读写 crm_opportunity_translations；
  // 无英文中枢兜底（标题双语已由定时任务双表扫描覆盖）
  router.get("/api/opportunities/:id/translation", async (req, res) => {
    try {
      const opportunityId = Number(req.params.id);
      const lang = String(req.query.lang || "").toLowerCase();
      if (!opportunityId || !NOTICE_TRANSLATION_LANGS[lang]) {
        return res.status(400).json({ error: "INVALID_OPPORTUNITY_OR_LANG" });
      }

      const [cachedRows] = await dbPool.query(
        "SELECT title_tr, description_tr FROM crm_opportunity_translations WHERE opportunity_id = ? AND lang = ? LIMIT 1",
        [opportunityId, lang]
      );
      const cachedRow = (cachedRows as any[])[0];
      if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
        return res.json({ lang, title: cachedRow.title_tr, description: cachedRow.description_tr, cached: true });
      }

      const [oppRows] = await dbPool.query(
        "SELECT title, description FROM crm_bid_opportunities WHERE id = ? LIMIT 1",
        [opportunityId]
      );
      const opp = (oppRows as any[])[0];
      if (!opp) return res.status(404).json({ error: "OPPORTUNITY_NOT_FOUND" });

      const pendingKey = `opp:${opportunityId}:${lang}`;
      let pending = pendingNoticeTranslations.get(pendingKey);
      if (!pending) {
        pending = translateNoticeViaChain(String(opp.title || ""), String(opp.description || ""), lang);
        pendingNoticeTranslations.set(pendingKey, pending);
        pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
      }
      const started = Date.now();
      const { translations, provider, degradedFrom } = await pending;
      // 结构化日志：与公告详情端点同款，含降级轨迹
      console.log(
        `[translate] target=opp:${opportunityId} lang=${lang} provider=${provider} ms=${Date.now() - started} degraded=${degradedFrom?.join(",") || "-"}`
      );

      if (provider === "same-lang-passthrough") {
        // passthrough 结果不入 crm_opportunity_translations，直接透传原文（同公告端点守卫）
        return res.json({ lang, title: translations[0], description: translations[1], cached: false, passthrough: true });
      }

      await dbPool.query(
        `INSERT INTO crm_opportunity_translations (opportunity_id, lang, title_tr, description_tr, model)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
        [opportunityId, lang, translations[0], translations[1], provider]
      );
      res.json({ lang, title: translations[0], description: translations[1], cached: false });
    } catch (err: any) {
      if (err?.message === "TRANSLATION_UNAVAILABLE") {
        return res.status(503).json({ error: "TRANSLATION_UNAVAILABLE" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/api/opportunities/:id/view", async (req, res) => {
    try {
      const opportunityId = Number(req.params.id);
      const userKey = normalizeUserKey(req.body.user_key) || "guest"; // 本地差异 #7：F.1 归一化收敛（浏览流水保留 guest）
      await dbPool.execute(
        `INSERT INTO crm_user_notice_views (user_id, user_key, opportunity_id, viewed_at, ip)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, NOW(), ?)`,
        [userKey, userKey, opportunityId, req.ip || req.socket?.remoteAddress || "127.0.0.1"]
      );
      await dbPool.execute(
        "UPDATE crm_bid_opportunities SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?",
        [opportunityId]
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/api/opportunities/:id/unlock", async (req, res) => {
    try {
      const opportunityId = Number(req.params.id);
      // 本地差异 #7：F.1——同 notices unlock：流水保留 guest，兴趣码仅实名写入
      const normalizedUserKey = normalizeUserKey(req.body.user_key);
      const userKey = normalizedUserKey || "guest";
      const unlockType = req.body.unlock_type === "subscription" || req.body.unlock_type === "single"
        ? req.body.unlock_type
        : "free";
      const price = unlockType === "single" ? Number(req.body.price || 19) : 0;

      const [existing] = await dbPool.query(
        "SELECT id, unlock_type FROM crm_opportunity_unlocks WHERE user_key = ? AND opportunity_id = ? LIMIT 1",
        [userKey, opportunityId]
      );
      if ((existing as any[]).length > 0) {
        return res.json({ success: true, alreadyUnlocked: true });
      }

      if (unlockType === "free") {
        // 免费配额统一读 crm_membership_plans（与 /api/notices/:id/unlock 同源），不再硬编码
        const [freePlanRows] = await dbPool.query(
          "SELECT free_quota FROM crm_membership_plans WHERE plan_code = 'free' LIMIT 1"
        );
        const freeQuota = Number((freePlanRows as any[])[0]?.free_quota || 3);
        const [freeRows] = await dbPool.query(
          "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type = 'free'",
          [userKey]
        );
        if (Number((freeRows as any[])[0]?.total || 0) >= freeQuota) {
          return res.status(402).json({ error: "FREE_LIMIT_REACHED" });
        }
      }

      const [oppRows] = await dbPool.query(
        "SELECT id, unspsc_codes FROM crm_bid_opportunities WHERE id = ? LIMIT 1",
        [opportunityId]
      );
      const opp = (oppRows as any[])[0];
      if (!opp) return res.status(404).json({ error: "Opportunity not found" });
      const snapshot = normalizeUnspscCodes(opp.unspsc_codes);

      await dbPool.execute(
        `INSERT INTO crm_opportunity_unlocks
          (user_id, user_key, opportunity_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, NOW(), ?)`,
        [userKey, userKey, opportunityId, unlockType, price, JSON.stringify(snapshot)]
      );
      await dbPool.execute(
        "UPDATE crm_bid_opportunities SET unlock_count = COALESCE(unlock_count, 0) + 1 WHERE id = ?",
        [opportunityId]
      );

      // 本地差异 #7：F.1——guest 拒写兴趣码（解锁流水已保留）
      if (normalizedUserKey) {
        for (const item of snapshot) {
          const rawCode = String(item?.code || item || "").replace(/\D/g, "").slice(0, 8);
          if (!rawCode) continue;
          const [codeRows] = await dbPool.query(
            "SELECT id, level FROM crm_unspsc_codes WHERE code = ? LIMIT 1",
            [rawCode]
          );
          const codeRow = (codeRows as UnspscCodeRow[])[0];
          await dbPool.execute(
            `INSERT INTO crm_user_interest_codes (user_id, user_key, code_id, code, level, source, weight)
             VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, 'unlock_order', 2.50)
             ON DUPLICATE KEY UPDATE weight = weight + 0.50, updated_at = NOW()`,
            [userKey, userKey, codeRow?.id || null, rawCode, codeRow?.level || 1]
          );
        }
      }

      res.status(201).json({ success: true, unlock_type: unlockType });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
