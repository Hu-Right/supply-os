/**
 * 公采搜索/统计/推荐路由
 * Notice search, stats & recommendation routes
 *
 * @module server/routes/notices/search.routes
 * @description 路由层仅做参数解析、校验与搜索日志；SQL 组装与推荐算法
 *              见 services/noticeSearch 与 services/noticeRecommend。
 */
import { Router } from "express";
import crypto from "crypto";
import type { AppContext } from "../../context";
import type { Request } from "express";
import { parseOptionalInt, parseOptionalString } from "../../utils/params";
import { asyncHandler } from "../../middleware/errorHandler";
import { getNoticeCountries, getNoticeAgencies, getNoticeStats } from "../../services/notice-search/index";
import { searchUnified, type RawSearchParams } from "../../services/search-orchestrator/index";

/** 从请求提取统一搜索参数（unified-search 与旧端点适配器共用）
 * B1 legacy 退役（2026-08-19）：身份唯一来源为 req.userKey（optionalAuth 仅 JWT），
 * query.user_key 兜底已删除；匿名请求 userKey 为空串 */
function parseUnifiedParams(req: Request, mode: string): RawSearchParams {
  return {
    mode,
    userKey: req.userKey || "",
    page: parseOptionalInt(req.query, "page", 1, 1000, 1),
    pageSize: parseOptionalInt(req.query, "page_size", 6, 30, 9),
    locale: parseOptionalString(req.query, "locale", 10) || "",
    q: parseOptionalString(req.query, "q", 200) || "",
    country: parseOptionalString(req.query, "country", 100) || "",
    agency: parseOptionalString(req.query, "agency", 100) || "",
    deadlineFrom: parseOptionalString(req.query, "deadline_from", 10) || "",
    deadlineTo: parseOptionalString(req.query, "deadline_to", 10) || "",
    deadlineWithinDays: parseOptionalInt(req.query, "deadline_within_days", 0, 365, 0),
    noticeType: parseOptionalString(req.query, "notice_type", 100) || "",
    featuredOnly: String(req.query.featured || "") === "1",
    sort: parseOptionalString(req.query, "sort", 20) || "deadline_farthest",
    codeId: parseOptionalInt(req.query, "code_id", 0, 1e9, 0) || parseOptionalInt(req.query, "industry_id", 0, 1e9, 0),
  };
}

// N2 收敛（2026-08-20）：原手工白名单 VALID_NOTICE_TYPES/isValidNoticeType 已删除，
// 类型合法性唯一端口为 utils/notice-type 的 isKnownNoticeType（由 normalizeNoticeType 派生，
// 修复白名单与归一化函数漂移导致 COMPETITIVE/CONTRACT_NOTICE 筛选被静默拦截的问题）。

export function createNoticeSearchRouter(ctx: AppContext): Router {
  const router = Router();

  // ── 统一搜索端点（重构方案 §4.1）：mode=default|prefs|recommended ──
  // N2 退役（2026-08-20）：原 /api/notices、/api/notices/recommended、/api/notices/industry-matched
  // 三个委托适配器已删除——前端已全量切换到 unified-search（mode=prefs/recommended），零调用方。
  router.get("/api/notices/unified-search", asyncHandler(async (req, res) => {
    const rawMode = String(req.query.mode || "default");
    const mode = rawMode === "prefs" || rawMode === "recommended" ? rawMode : "default";
    const result = await searchUnified(ctx.dbPool, parseUnifiedParams(req, mode));
    res.json({ ...result, page_size: result.pageSize });
  }));

  router.get("/api/notices/countries", asyncHandler(async (req, res) => {
    // P1 性能优化：浏览器缓存 10 分钟（与服务端缓存 TTL 对齐），减少重复请求
    res.setHeader("Cache-Control", "public, max-age=600");
    const data = await getNoticeCountries(ctx.dbPool);
    // P2 性能优化：ETag 条件请求——客户端 If-None-Match 命中时返回 304，零数据传输
    // 回滚：删除 etag/If-None-Match/304 逻辑，恢复 res.json(data)
    const etag = `"${crypto.createHash("md5").update(JSON.stringify(data)).digest("hex").slice(0, 16)}"`;
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.json(data);
  }));

  router.get("/api/notices/agencies", asyncHandler(async (req, res) => {
    const locale = String(req.query.locale || "").toLowerCase();
    res.setHeader("Cache-Control", "public, max-age=600");
    const data = await getNoticeAgencies(ctx.dbPool, locale || undefined);
    const etag = `"${crypto.createHash("md5").update(JSON.stringify(data)).digest("hex").slice(0, 16)}"`;
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.json(data);
  }));

  router.get("/api/notices/stats", asyncHandler(async (req, res) => {
    const data = await getNoticeStats(ctx.dbPool);
    const etag = `"${crypto.createHash("md5").update(JSON.stringify(data)).digest("hex").slice(0, 16)}"`;
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.json(data);
  }));

  return router;
}
