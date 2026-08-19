/**
 * 行业精准匹配路由
 * Industry match routes
 *
 * @module server/routes/notices/industry-match.routes
 * @description GET /api/notices/industry-matched：按用户五级行业返回精准匹配公告。
 *              路由层仅做参数解析与校验；匹配逻辑统一走 search-orchestrator
 *              （mode=prefs，Meilisearch 单路检索 + 渐进放宽）。
 *              响应 items 附带 match_score（匹配分）与 match_tier（命中档次），
 *              供前端展示推荐理由；fallback 区分 no_prefs / no_match / none。
 *
 *              行业匹配模式下可叠加全部筛选参数（与 /api/notices 对齐）：
 *              关键词/国家/机构/日期/采购类型/精选等。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { parseOptionalInt, parseOptionalString } from "../../utils/params";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/auth";
import { searchUnified } from "../../services/search-orchestrator/index";

export function createIndustryMatchRouter(ctx: AppContext): Router {
  const router = Router();
  const noticesRepo = ctx.notice.noticesRepo;

  // GET /api/notices/industry-matched?page=1&page_size=10&locale=zh&q=...&country=...
  // B1 legacy 退役（2026-08-19）：requireAuth 强制 JWT 身份——本端点返回个性化匹配结果，
  // 旧版 query.user_key 可伪造读取他人匹配数据（清点报告 §2.2 中风险项）。
  // 前端已全量切换到 unified-search mode=prefs，无调用方受影响。
  router.get("/api/notices/industry-matched", requireAuth, asyncHandler(async (req, res) => {
      const userKey = req.userKey || "";
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

      // 统一编排器 mode=prefs（Meilisearch 单路检索 + 渐进放宽）
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
      });
      res.json({ ...result, page_size: pageSize });
  }));

  return router;
}
