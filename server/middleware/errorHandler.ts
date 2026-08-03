/**
 * 统一错误处理中间件
 * Centralized error-handling middleware
 *
 * @module server/middleware/errorHandler
 * @description Express 错误处理四元组（err, req, res, next）。
 *   - 已知业务错误（err.statusCode 已设）按原状态码返回
 *   - 未知错误统一 500，生产环境隐藏堆栈
 *   - JSON 结构化响应 { error, message? }
 */
import type { Request, Response, NextFunction } from "express";

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorHandler(
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const status = err.statusCode ?? 500;
  const message = err.message || "Internal Server Error";

  if (status >= 500) {
    // 服务端错误记日志（后续 C3 ErrorReporter 对接点）
    console.error("[errorHandler]", err);
  }

  // 生产环境 500 错误不暴露内部细节（数据库结构、文件路径等）
  const isProduction = process.env.NODE_ENV === "production";
  res.status(status).json({ error: status >= 500 && isProduction ? "INTERNAL_ERROR" : message });
}

/** 404 兜底：仅拦截 /api/* 未匹配请求，非 API 路径放行给 SPA fallback */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  next();
}

/**
 * 异步路由包装器——消除路由内重复 try/catch
 * Usage: router.get("/path", asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
