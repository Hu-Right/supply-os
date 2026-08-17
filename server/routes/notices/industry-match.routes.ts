/**
 * 行业精准匹配路由
 * Industry match routes
 *
 * @module server/routes/notices/industry-match.routes
 * @description GET /api/notices/industry-matched：按用户五级行业返回精准匹配公告。
 *              路由层仅做参数解析与校验；匹配逻辑见 services/industry-match。
 *              响应 items 附带 match_score（匹配分）与 match_tier（命中档次），
 *              供前端展示推荐理由；fallback 区分 no_prefs / no_match / none。
 *
 *              统一化重构后：支持全部筛选参数（与 /api/notices 对齐），
 *              行业匹配模式下可叠加关键词/国家/机构/日期/采购类型/精选等筛选。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { normalizeUserKey } from "../../utils/normalize";
import { parseOptionalInt, parseOptionalString } from "../../utils/params";
import { asyncHandler } from "../../middleware/errorHandler";
import { matchNoticesByIndustry } from "../../services/industry-match";
import { searchUnified } from "../../services/search-orchestrator/index";

/**
 * 回滚开关：USE_LEGACY_IMPL=1 时走旧版两阶段实现（matchNoticesByIndustry），
 * 默认走统一编排器 mode=prefs（消除两阶段 IN 子句架构）。重构验收后移除。
 */
const USE_LEGACY_IMPL = process.env.USE_LEGACY_IMPL === "1";

export function createIndustryMatchRouter(ctx: AppContext): Router {
  const router = Router();
  const noticesRepo = ctx.noticesRepo;

  // GET /api/notices/industry-matched?user_key=...&page=1&page_size=10&locale=zh&q=...&country=...
  router.get("/api/notices/industry-matched", asyncHandler(async (req, res) => {
      const userKey = normalizeUserKey(req.query.user_key) || "";
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const page = parseOptionalInt(req.query, "page", 1, 1000, 1);
      const pageSize = parseOptionalInt(req.query, "page_size", 1, 30, 10);
      // 界面语言（所有语言含 zh 均走统一翻译回退链）
      const locale = parseOptionalString(req.query, "locale", 10) || undefined;

      // 解析全部筛选参数（与 search.routes.ts 对齐）
      const q = parseOptionalString(req.query, "q", 200);
      const country = parseOptionalString(req.query, "country", 100);
      const agency = parseOptionalString(req.query, "agency", 100);
      const deadlineFrom = parseOptionalString(req.query, "deadline_from", 10);
      const deadlineTo = parseOptionalString(req.query, "deadline_to", 10);
      const deadlineWithinDays = parseOptionalInt(req.query, "deadline_within_days", 0, 365, 0);
      const noticeType = parseOptionalString(req.query, "notice_type", 100);
      const featuredOnly = String(req.query.featured || "") === "1";
      const sort = parseOptionalString(req.query, "sort", 20) || "deadline_farthest";

      // 默认：统一编排器 mode=prefs（Meilisearch 单路检索 + 渐进放宽）
      if (!USE_LEGACY_IMPL) {
        const result = await searchUnified(ctx.dbPool, {
          mode: "prefs",
          userKey,
          page,
          pageSize,
          locale: locale || "",
          q: q || "",
          country: country || "",
          agency: agency || "",
          deadlineFrom: deadlineFrom || "",
          deadlineTo: deadlineTo || "",
          deadlineWithinDays,
          noticeType: noticeType || "",
          featuredOnly,
          sort,
        }, noticesRepo);
        return res.json({ ...result, page_size: pageSize });
      }

      // 回滚分支：旧版两阶段实现
      const result = await matchNoticesByIndustry(ctx.dbPool, userKey, page, pageSize, locale, noticesRepo, {
        q: q || undefined,
        country: country || undefined,
        agency: agency || undefined,
        deadlineFrom: deadlineFrom || undefined,
        deadlineTo: deadlineTo || undefined,
        deadlineWithinDays: deadlineWithinDays || undefined,
        noticeType: noticeType || undefined,
        featuredOnly: featuredOnly || undefined,
        sort,
      });
      res.json({ ...result, page_size: pageSize });
  }));

  return router;
}
