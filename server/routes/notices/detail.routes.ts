/**
 * 公告详情与翻译路由
 * Notice detail & translation routes
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { normalizeUserKey } from "../../utils/normalize";
import { normalizeNoticeDetailPayload, findQualifiedOpportunityForNotice } from "../../services/notices";
import {
  NOTICE_TRANSLATION_LANGS, pendingNoticeTranslations,
  translateNoticeViaChain, detectSourceLang,
} from "../../services/notice-translation";

export function createNoticeDetailRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  // ── 公告详情 ──
  router.get("/api/notices/:id/detail", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.query.user_key) || "";
      if (!noticeId || !userKey) return res.status(400).json({ error: "USER_AND_NOTICE_REQUIRED" });

      const [unlockRows] = await dbPool.query(
        "SELECT id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
        [userKey, noticeId]
      );
      const unlock = (unlockRows as any[])[0];
      if (!unlock) return res.status(403).json({ error: "NOTICE_LOCKED", core_locked: true });

      const [noticeRows] = await dbPool.query(
        `SELECT id, notice_id, reference, title, notice_type, agency, organization, country,
           deadline, deadline_ts, estimated_value, description, industry, url, contacts,
           documents, procurement_files, external_links, agency_full, published_date,
           difficulty, registration_level, key_contacts, unspsc_codes, converted_opp_id, is_converted
         FROM crm_bid_notices WHERE id = ? LIMIT 1`,
        [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });
      const opportunity = await findQualifiedOpportunityForNotice(dbPool, notice);
      res.json(normalizeNoticeDetailPayload(notice, unlock, opportunity));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── 公告翻译 ──
  router.get("/api/notices/:id/translation", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const lang = String(req.query.lang || "").toLowerCase();
      if (!noticeId || !NOTICE_TRANSLATION_LANGS[lang]) {
        return res.status(400).json({ error: "INVALID_NOTICE_OR_LANG" });
      }

      const [cachedRows] = await dbPool.query(
        "SELECT title_tr, description_tr FROM crm_notice_translations WHERE notice_id = ? AND lang = ? LIMIT 1",
        [noticeId, lang]
      );
      const cachedRow = (cachedRows as any[])[0];
      if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
        return res.json({ lang, title: cachedRow.title_tr, description: cachedRow.description_tr, cached: true });
      }
      if (cachedRow && cachedRow.title_tr && !cachedRow.description_tr) {
        const [noticeRowsForDesc] = await dbPool.query(
          "SELECT description FROM crm_bid_notices WHERE id = ? LIMIT 1", [noticeId]
        );
        const noticeForDesc = (noticeRowsForDesc as any[])[0];
        if (!noticeForDesc || !String(noticeForDesc.description || "").trim()) {
          return res.json({ lang, title: cachedRow.title_tr, description: null, cached: true });
        }
        const pendingKeyDesc = `${noticeId}:${lang}:desc`;
        let pendingDesc = pendingNoticeTranslations.get(pendingKeyDesc);
        if (!pendingDesc) {
          pendingDesc = translateNoticeViaChain("", String(noticeForDesc.description), lang);
          pendingNoticeTranslations.set(pendingKeyDesc, pendingDesc);
          pendingDesc.finally(() => pendingNoticeTranslations.delete(pendingKeyDesc)).catch(() => undefined);
        }
        const { translations: descTranslations, provider: descProvider } = await pendingDesc;
        const descTr = descTranslations[1];
        await dbPool.query(
          `UPDATE crm_notice_translations SET description_tr = ?, model = ? WHERE notice_id = ? AND lang = ?`,
          [descTr, descProvider, noticeId, lang]
        );
        return res.json({ lang, title: cachedRow.title_tr, description: descTr, cached: false });
      }

      const [noticeRows] = await dbPool.query(
        "SELECT title, description FROM crm_bid_notices WHERE id = ? LIMIT 1", [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });

      const pendingKey = `${noticeId}:${lang}`;
      let pending = pendingNoticeTranslations.get(pendingKey);
      if (!pending) {
        pending = translateNoticeViaChain(String(notice.title || ""), String(notice.description || ""), lang);
        pendingNoticeTranslations.set(pendingKey, pending);
        pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
      }
      const { translations, provider } = await pending;

      await dbPool.query(
        `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
        [noticeId, lang, translations[0], translations[1], provider]
      );
      res.json({ lang, title: translations[0], description: translations[1], cached: false });

      // ── 英文中枢兜底 ──
      if (lang !== "en") {
        const sourceLang = detectSourceLang(String(notice.title || ""), String(notice.description || ""));
        if (sourceLang && sourceLang !== "en") {
          void (async () => {
            try {
              const [enCheck] = await dbPool.query(
                "SELECT id FROM crm_notice_translations WHERE notice_id = ? AND lang = 'en' LIMIT 1", [noticeId]
              );
              if ((enCheck as any[]).length > 0) return;
              const enPendingKey = `${noticeId}:en`;
              if (pendingNoticeTranslations.has(enPendingKey)) return;
              const enPromise = translateNoticeViaChain(String(notice.title || ""), String(notice.description || ""), "en");
              pendingNoticeTranslations.set(enPendingKey, enPromise);
              enPromise.finally(() => pendingNoticeTranslations.delete(enPendingKey)).catch(() => undefined);
              const enResult = await enPromise;
              if (enResult.provider !== "same-lang-passthrough") {
                await dbPool.query(
                  `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
                   VALUES (?, 'en', ?, ?, ?)
                   ON DUPLICATE KEY UPDATE
                     title_tr = COALESCE(VALUES(title_tr), title_tr),
                     description_tr = COALESCE(VALUES(description_tr), description_tr)`,
                  [noticeId, enResult.translations[0] || null, enResult.translations[1] || null, enResult.provider]
                );
              }
            } catch { /* 英文中枢失败静默 */ }
          })();
        }
      }
    } catch (err: any) {
      if (err?.message === "TRANSLATION_UNAVAILABLE") {
        return res.status(503).json({ error: "TRANSLATION_UNAVAILABLE" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
