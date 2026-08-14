/**
 * 行业精准匹配路由
 * Industry match routes
 *
 * @module server/routes/notices/industry-match.routes
 * @description GET /api/notices/industry-matched：按用户五级行业返回精准匹配公告。
 *              路由层仅做参数解析与校验；匹配逻辑见 services/industry-match。
 *              响应 items 附带 match_score（匹配分）与 match_tier（命中档次），
 *              供前端展示推荐理由；fallback 区分 no_prefs / no_match / none。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { normalizeUserKey } from "../../utils/normalize";
import { parseOptionalInt, parseOptionalString } from "../../utils/params";
import { asyncHandler } from "../../middleware/errorHandler";
import { matchNoticesByIndustry } from "../../services/industry-match";

export function createIndustryMatchRouter(ctx: AppContext): Router {
  const router = Router();

  // GET /api/notices/industry-matched?user_key=...&page=1&page_size=10&locale=fr
  router.get("/api/notices/industry-matched", asyncHandler(async (req, res) => {
      const userKey = normalizeUserKey(req.query.user_key) || "";
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const page = parseOptionalInt(req.query, "page", 1, 1000, 1);
      const pageSize = parseOptionalInt(req.query, "page_size", 1, 30, 10);
      // 界面语言（fr/ru/es/ar 时返回对应译文；zh/en 用原文列，无需传）
      const locale = parseOptionalString(req.query, "locale", 10) || undefined;

      const result = await matchNoticesByIndustry(ctx.dbPool, userKey, page, pageSize, locale);
      res.json({ ...result, page_size: pageSize });
  }));

  return router;
}
