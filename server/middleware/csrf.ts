/**
 * CSRF 防护中间件
 * CSRF Protection Middleware
 *
 * @module server/middleware/csrf
 * @description 纵深防御：对状态变更请求（POST/PUT/DELETE）校验 Origin/Referer 白名单。
 *              JWT Bearer Token 请求跳过检查（API 客户端不受影响）。
 *              当 ALLOWED_ORIGINS 未配置或 CSRF_ENABLED=false 时跳过检查（开发环境友好）。
 *
 *              主要防护场景：JWT 存储在 localStorage 已天然免疫大部分 CSRF，
 *              但若有 Cookie 认证路径或浏览器自动携带凭证的场景，此中间件提供额外保障。
 */
import type { Request, Response, NextFunction } from "express";

const CSRF_ENABLED = process.env.CSRF_ENABLED !== "false"; // 默认启用
const ALLOWED_ORIGINS_RAW = process.env.ALLOWED_ORIGINS || "";

/** 解析白名单（逗号分隔 → 去空去重） */
function parseAllowedOrigins(): Set<string> {
  if (!ALLOWED_ORIGINS_RAW.trim()) return new Set();
  return new Set(
    ALLOWED_ORIGINS_RAW.split(",")
      .map((s) => s.trim().replace(/\/+$/, "")) // 去除尾部斜杠
      .filter(Boolean),
  );
}

/** 从请求中提取来源 Origin */
function extractOrigin(req: Request): string | null {
  // 优先 Origin 头（SPA 请求通常携带）
  const origin = req.headers.origin;
  if (origin && origin !== "null") return origin.replace(/\/+$/, "");

  // 回退到 Referer
  const referer = req.headers.referer || req.headers.referrer;
  if (referer) {
    try {
      const url = new URL(referer as string);
      return url.origin;
    } catch { /* Referer 格式异常，忽略 */ }
  }

  return null;
}

/**
 * CSRF 防护中间件
 * 仅对 POST/PUT/DELETE 生效；携带有效 JWT 的请求跳过检查。
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // P3-5 安全修复：ALLOWED_ORIGINS 未配置时默认拒绝（而非放行）
  // 仅当 CSRF_ENABLED=false 时才跳过检查
  if (!CSRF_ENABLED) return next();
  const allowedOrigins = parseAllowedOrigins();
  if (allowedOrigins.size === 0) {
    // 白名单为空意味着未配置允许的来源，出于安全考虑拒绝所有状态变更请求
    // 但允许无 Origin 的 GET/HEAD/OPTIONS（已在上方放行）
    const method = req.method.toUpperCase();
    if (method === "POST" || method === "PUT" || method === "DELETE") {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) return next(); // JWT 请求跳过
      res.status(403).json({ error: "CSRF_NOT_CONFIGURED" });
      return;
    }
    return next();
  }

  // 仅检查状态变更方法
  const method = req.method.toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "DELETE") return next();

  // 携带 JWT Bearer Token 的请求跳过（API 客户端 / 移动端不受影响）
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) return next();

  // 提取来源并校验
  const origin = extractOrigin(req);
  if (!origin) {
    // 无 Origin 且无 Referer：可能是非浏览器客户端或隐私设置清除
    // 出于安全考虑，拒绝无来源的状态变更请求
    // 但允许无 Origin 的 GET/HEAD/OPTIONS（已在上方放行）
    res.status(403).json({ error: "CSRF_ORIGIN_MISSING" });
    return;
  }

  if (!allowedOrigins.has(origin)) {
    res.status(403).json({ error: "CSRF_ORIGIN_FORBIDDEN" });
    return;
  }

  next();
}
