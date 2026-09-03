/**
 * API 统一响应工具（架构评估 TY2：复活死代码并对齐存量契约）
 *
 * @module lib/api/response
 * @description 响应契约与全仓现状及 api-client 读取逻辑一致：
 *              - 2xx：裸载荷（不包 envelope）
 *              - 4xx/5xx：{ code: number, message: string }
 *              新代码优先使用 withRoute + routeError（lib/middleware/route-handler），
 *              本模块供不便整体包装的调用点（如工具函数返回 Response）使用。
 */
import { NextResponse } from "next/server";

/** 成功响应：裸载荷 */
export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** 错误响应：标准 envelope */
export function apiFail(status: number, code: number, message: string): NextResponse {
  return NextResponse.json({ code, message }, { status });
}

/** 400 参数错误 */
export function apiBadRequest(message: string, code = 40000): NextResponse {
  return apiFail(400, code, message);
}

/** 401 未登录 */
export function apiUnauthorized(message = "请先登录", code = 40042): NextResponse {
  return apiFail(401, code, message);
}

/** 403 禁止 */
export function apiForbidden(message: string, code = 40003): NextResponse {
  return apiFail(403, code, message);
}

/** 404 不存在 */
export function apiNotFound(message: string, code = 40004): NextResponse {
  return apiFail(404, code, message);
}

/** 409 冲突 */
export function apiConflict(message: string, code = 40030): NextResponse {
  return apiFail(409, code, message);
}

/** 500 内部错误 */
export function apiInternalError(message = "服务器内部错误", code = 50000): NextResponse {
  return apiFail(500, code, message);
}
