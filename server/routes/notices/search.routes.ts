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
import { normalizeUserKey } from "../../utils/normalize";
import { parseOptionalInt, parseOptionalString } from "../../utils/params";
import { asyncHandler } from "../../middleware/errorHandler";
import { searchNotices, getNoticeCountries, getNoticeAgencies, getNoticeStats } from "../../services/noticeSearch";
import { recommendNotices } from "../../services/noticeRecommend";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createNoticeSearchRouter(ctx: AppContext): Router {
  const router = Router();
  const noticesRepo = ctx.noticesRepo;

  router.get("/api/notices", asyncHandler(async (req, res) => {
    const page = parseOptionalInt(req.query, "page", 1, 1000, 1);
    const pageSize = parseOptionalInt(req.query, "page_size", 6, 30, 9);
    const codeId = parseOptionalInt(req.query, "code_id", 0, 1e9, 0) || parseOptionalInt(req.query, "industry_id", 0, 1e9, 0);
    const q = parseOptionalString(req.query, "q", 200);
    const country = parseOptionalString(req.query, "country", 100);
    const agency = parseOptionalString(req.query, "agency", 100);
    const deadlineFrom = parseOptionalString(req.query, "deadline_from", 10);
    const deadlineTo = parseOptionalString(req.query, "deadline_to", 10);
    const sort = parseOptionalString(req.query, "sort", 20) || "deadline_farthest";
    const deadlineWithinDays = parseOptionalInt(req.query, "deadline_within_days", 0, 365, 0);
    const noticeType = parseOptionalString(req.query, "notice_type", 100);
    const featuredOnly = String(req.query.featured || "") === "1";
    // 卡片国际化：透传当前 locale，服务端 LEFT JOIN 翻译表返回 title_i18n / description_i18n
    const locale = parseOptionalString(req.query, "locale", 10);

    const result = await searchNotices(ctx.dbPool, {
      page, pageSize, codeId, q, country, agency, deadlineFrom, deadlineTo, sort,
      deadlineWithinDays, noticeType, featuredOnly, locale,
    }, noticesRepo);

    // P2 性能优化：流式响应——立即发送 HTTP headers，然后分块写入 JSON body
    // 浏览器收到 headers 后即可开始解析，无需等待完整 JSON 序列化完成
    // 回滚：恢复为 res.json(result)
    const json = JSON.stringify(result);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Length", Buffer.byteLength(json));
    res.flushHeaders(); // 立即发送 headers，消除 header 等待时间
    // 大响应分块写入（16KB 块），小响应一次性发送
    const CHUNK_SIZE = 16 * 1024;
    if (json.length > CHUNK_SIZE) {
      for (let i = 0; i < json.length; i += CHUNK_SIZE) {
        res.write(json.slice(i, i + CHUNK_SIZE));
      }
      res.end();
    } else {
      res.end(json);
    }

    // 搜索行为日志：仅带筛选条件的检索入库（推荐/空载不计）
    const hasSearch = Boolean(
      q || country || agency || DATE_RE.test(deadlineFrom) || DATE_RE.test(deadlineTo) ||
      deadlineWithinDays || noticeType || featuredOnly
    );
    if (hasSearch) {
      const filters = JSON.stringify({
        code_id: codeId || undefined,
        deadline_from: DATE_RE.test(deadlineFrom) ? deadlineFrom : undefined,
        deadline_to: DATE_RE.test(deadlineTo) ? deadlineTo : undefined,
        deadline_within_days: deadlineWithinDays || undefined,
        notice_type: noticeType || undefined,
        featured: featuredOnly || undefined,
        sort,
      });
      void noticesRepo.logSearch(
        normalizeUserKey(req.query.user_key), q || null, country || null, filters, result.total
      ).catch(() => undefined);
    }
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

  // ── 推荐端点 ──
  router.get("/api/notices/recommended", asyncHandler(async (req, res) => {
    const userKey = normalizeUserKey(req.query.user_key) || "";
    const page = parseOptionalInt(req.query, "page", 1, 1000, 1);
    const pageSize = parseOptionalInt(req.query, "page_size", 6, 30, 9);
    // 卡片国际化：透传当前 locale
    const locale = parseOptionalString(req.query, "locale", 10);
    res.json(await recommendNotices(ctx.dbPool, userKey, page, pageSize, locale, noticesRepo));
  }));

  return router;
}
