/**
 * CSRF 防护 helper（Next.js 版）
 *
 * @module lib/middleware/csrf
 * @description 从 server/middleware/csrf.ts 移植。
 *              对状态变更请求（POST/PUT/DELETE）校验 Origin/Referer 白名单。
 *              携带 JWT Bearer Token 的请求跳过检查。
 *              返回 null 表示放行，返回 Response 表示拒绝。
 */
import { NextRequest, NextResponse } from "next/server";

const CSRF_ENABLED = process.env.CSRF_ENABLED !== "false";

function parseAllowedOrigins(): Set<string> {
  const raw = process.env.ALLOWED_ORIGINS || "";
  if (!raw.trim()) return new Set();
  return new Set(raw.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean));
}

function extractOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") return origin.replace(/\/+$/, "");
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* 忽略 */
    }
  }
  return null;
}

/**
 * CSRF 校验。
 * @returns null 放行；NextResponse 拒绝。
 */
export function checkCsrf(req: NextRequest): NextResponse | null {
  if (!CSRF_ENABLED) return null;

  const allowedOrigins = parseAllowedOrigins();
  const method = req.method.toUpperCase();

  // 仅检查状态变更方法
  if (method !== "POST" && method !== "PUT" && method !== "DELETE") return null;

  // JWT Bearer 请求跳过
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) return null;

  // 白名单为空：默认拒绝
  if (allowedOrigins.size === 0) {
    return NextResponse.json(
      { code: 41005, message: "CSRF not configured", error: "CSRF not configured" },
      { status: 403 },
    );
  }

  const origin = extractOrigin(req);
  if (!origin) {
    return NextResponse.json(
      { code: 41006, message: "Origin header missing", error: "Origin header missing" },
      { status: 403 },
    );
  }

  if (!allowedOrigins.has(origin)) {
    return NextResponse.json(
      { code: 41007, message: "Origin not allowed", error: "Origin not allowed" },
      { status: 403 },
    );
  }

  return null;
}
