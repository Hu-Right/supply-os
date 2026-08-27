/**
 * API 统一响应工具
 * Unified API Response Helpers
 *
 * @module lib/api/response
 * @description 为所有 Route Handler 提供标准化的 JSON 响应格式。
 *              成功响应：{ data: T, ok: true }
 *              错误响应：{ error: { message, code? }, ok: false }
 */
import { NextResponse } from "next/server";

/** 成功响应 */
export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data, ok: true }, { status });
}

/** 错误响应 */
export function apiError(
  status: number,
  message: string,
  code?: string,
): NextResponse {
  return NextResponse.json(
    { error: { message, code }, ok: false },
    { status },
  );
}

/** 400 Bad Request */
export function apiBadRequest(message: string): NextResponse {
  return apiError(400, message, "BAD_REQUEST");
}

/** 401 Unauthorized */
export function apiUnauthorized(message = "Unauthorized"): NextResponse {
  return apiError(401, message, "UNAUTHORIZED");
}

/** 403 Forbidden */
export function apiForbidden(message = "Forbidden"): NextResponse {
  return apiError(403, message, "FORBIDDEN");
}

/** 404 Not Found */
export function apiNotFound(message = "Not found"): NextResponse {
  return apiError(404, message, "NOT_FOUND");
}

/** 500 Internal Server Error */
export function apiInternalError(message = "Internal server error"): NextResponse {
  return apiError(500, message, "INTERNAL_ERROR");
}
