/**
 * 认证 Cookie 工具
 * Auth Cookie Utilities
 *
 * @module server/utils/auth-cookies
 * @description B2【P1】安全加固：Refresh Token 从 localStorage 迁移到 HttpOnly Cookie，
 *   防止 XSS 窃取长期有效的 Refresh Token（详见《深度技术分析报告》§B2）。
 *
 *   Cookie 属性：
 *   - HttpOnly：JavaScript 不可读，XSS 无法窃取
 *   - Secure：仅 HTTPS 传输（生产环境）
 *   - SameSite=Strict：防止 CSRF 跨站携带
 *   - Max-Age=7d：与 Refresh Token 有效期对齐
 */
import type { Request, Response } from "express";

const REFRESH_COOKIE_NAME = "supply_os_refresh_token";
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 天（秒）

/**
 * 在响应中设置 Refresh Token HttpOnly Cookie
 */
export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_COOKIE_MAX_AGE * 1000, // ms
    path: "/api/auth", // 仅认证端点发送此 Cookie
  });
}

/**
 * 清除 Refresh Token Cookie
 */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
  });
}

/**
 * 从请求中读取 Refresh Token Cookie
 */
export function readRefreshCookie(req: Request): string {
  // 优先使用 cookie-parser 解析的 req.cookies（如已安装）
  if ((req as any).cookies?.[REFRESH_COOKIE_NAME]) {
    return String((req as any).cookies[REFRESH_COOKIE_NAME]).trim();
  }
  // 回退：手动解析 Cookie 头
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.split("=")[1]).trim() : "";
}
