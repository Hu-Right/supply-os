/**
 * 公采搜索/统计/推荐路由
 * Notice search, stats & recommendation routes
 *
 * @module server/routes/notices/search.routes
 * @description 路由层仅做参数解析、校验与搜索日志；SQL 组装与推荐算法
 *              见 services/noticeSearch 与 services/noticeRecommend。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { normalizeUserKey } from "../../utils/normalize";
import { searchNotices, getNoticeCountries, getNoticeStats } from "../../services/noticeSearch";
import { recommendNotices } from "../../services/noticeRecommend";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createNoticeSearchRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  router.get("/api/notices", async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(30, Math.max(6, Number(req.query.page_size || 9)));
      const codeId = Number(req.query.code_id || req.query.industry_id || 0);
      const q = String(req.query.q || "").trim().slice(0, 200);
      const country = String(req.query.country || "").trim().slice(0, 100);
      const deadlineFrom = String(req.query.deadline_from || "").trim();
      const deadlineTo = String(req.query.deadline_to || "").trim();
      const sort = String(req.query.sort || "deadline");
      const valueMin = Number.isFinite(Number(req.query.value_min)) && Number(req.query.value_min) > 0
        ? Number(req.query.value_min) : 0;
      const valueMax = Number.isFinite(Number(req.query.value_max)) && Number(req.query.value_max) > 0
        ? Number(req.query.value_max) : 0;
      const deadlineWithinDays = Number.isInteger(Number(req.query.deadline_within_days))
        ? Math.min(365, Math.max(0, Number(req.query.deadline_within_days))) : 0;
      const noticeType = String(req.query.notice_type || "").trim().slice(0, 100);
      // [精选功能重新启用 2026-07-31] featured=1 只看精选（三路合格机会判定，T-A4）
      const featuredOnly = String(req.query.featured || "") === "1";

      const result = await searchNotices(dbPool, {
        page, pageSize, codeId, q, country, deadlineFrom, deadlineTo, sort,
        valueMin, valueMax, deadlineWithinDays, noticeType, featuredOnly,
      });
      res.json(result);

      // 搜索行为日志：仅带筛选条件的检索入库（推荐/空载不计）
      const hasSearch = Boolean(
        q || country || DATE_RE.test(deadlineFrom) || DATE_RE.test(deadlineTo) ||
        valueMin || valueMax || deadlineWithinDays || noticeType || featuredOnly
      );
      if (hasSearch) {
        const filters = JSON.stringify({
          code_id: codeId || undefined,
          deadline_from: DATE_RE.test(deadlineFrom) ? deadlineFrom : undefined,
          deadline_to: DATE_RE.test(deadlineTo) ? deadlineTo : undefined,
          value_min: valueMin || undefined,
          value_max: valueMax || undefined,
          deadline_within_days: deadlineWithinDays || undefined,
          notice_type: noticeType || undefined,
          featured: featuredOnly || undefined,
          sort,
        });
        void dbPool
          .execute(
            "INSERT INTO crm_user_search_log (user_key, q, country, filters, result_cnt) VALUES (?, ?, ?, ?, ?)",
            [normalizeUserKey(req.query.user_key), q || null, country || null, filters, result.total]
          )
          .catch(() => undefined);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/notices/countries", async (_req, res) => {
    try {
      res.json(await getNoticeCountries(dbPool));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  router.get("/api/notices/stats", async (_req, res) => {
    try {
      res.json(await getNoticeStats(dbPool));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── 推荐端点 ──
  router.get("/api/notices/recommended", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || "";
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(30, Math.max(6, Number(req.query.page_size || 9)));
      res.json(await recommendNotices(dbPool, userKey, page, pageSize));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  return router;
}
