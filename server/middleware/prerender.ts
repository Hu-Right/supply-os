/**
 * 爬虫检测中间件
 * 检测搜索引擎爬虫的 User-Agent，返回预渲染的静态 HTML
 *
 * 支持的爬虫：
 * - Googlebot (Google)
 * - Baiduspider (百度)
 * - Bingbot (Bing)
 * - Slurp (Yahoo)
 * - DuckDuckBot (DuckDuckGo)
 * - YandexBot (Yandex)
 * - FacebookExternalHit (Facebook)
 * - Twitterbot (Twitter)
 * - LinkedInBot (LinkedIn)
 *
 * @module middleware/prerender
 */

import fs from "fs";
import path from "path";
import type { Request, Response, NextFunction } from "express";

/** 常见搜索引擎爬虫的 User-Agent 标识 */
const CRAWLER_UA_PATTERNS = [
  /googlebot/i,
  /baiduspider/i,
  /bingbot/i,
  /slurp/i, // Yahoo
  /duckduckbot/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
];

/** 预渲染 HTML 缓存（内存缓存，避免重复读取文件） */
const prerenderCache = new Map<string, { html: string; ts: number }>();

/** 缓存过期时间：1 小时 */
const CACHE_TTL = 60 * 60 * 1000;

/**
 * 检测是否为搜索引擎爬虫
 */
export function isCrawler(userAgent: string): boolean {
  if (!userAgent) return false;
  return CRAWLER_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * 获取预渲染的 HTML
 * @param requestPath - 请求路径（如 /showroom）
 * @returns 预渲染的 HTML 内容，如果不存在则返回 null
 */
function getPrerenderedHtml(requestPath: string): string | null {
  // 规范化路径
  const normalizedPath = requestPath === "/" ? "/index" : requestPath.replace(/^\//, "");
  const cacheKey = normalizedPath;

  // 检查缓存
  const cached = prerenderCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.html;
  }

  // 尝试读取预渲染文件
  const prerenderPath = path.join(
    process.cwd(),
    "dist",
    "prerender",
    normalizedPath,
    "index.html"
  );

  try {
    if (fs.existsSync(prerenderPath)) {
      const html = fs.readFileSync(prerenderPath, "utf-8");
      // 更新缓存
      prerenderCache.set(cacheKey, { html, ts: Date.now() });
      return html;
    }
  } catch (error) {
    console.warn(`[prerender] 读取预渲染文件失败 (${prerenderPath}):`, (error as Error).message);
  }

  return null;
}

/**
 * 爬虫检测中间件
 * 如果检测到爬虫 UA 且存在预渲染 HTML，则返回静态 HTML
 * 否则继续下一个中间件（返回 SPA）
 */
export function prerenderMiddleware(req: Request, res: Response, next: NextFunction): void {
  const userAgent = req.headers["user-agent"] || "";

  // 仅对 GET 请求和爬虫 UA 生效
  if (req.method !== "GET" || !isCrawler(userAgent)) {
    return next();
  }

  // 尝试获取预渲染 HTML
  const prerenderedHtml = getPrerenderedHtml(req.path);

  if (prerenderedHtml) {
    console.log(`[prerender] 为爬虫返回预渲染 HTML: ${req.path} (UA: ${userAgent.substring(0, 50)}...)`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600"); // 缓存 1 小时
    res.setHeader("X-Prerendered", "true"); // 标记为预渲染响应
    res.send(prerenderedHtml);
  } else {
    // 预渲染文件不存在，降级到 SPA
    next();
  }
}

/**
 * 清除预渲染缓存（用于测试或手动刷新）
 */
export function clearPrerenderCache(): void {
  prerenderCache.clear();
}
