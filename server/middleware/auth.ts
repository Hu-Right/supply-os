/**
 * 认证中间件
 * Auth middleware — extract & validate user_key from query or body
 *
 * @module server/middleware/auth
 * @description 从 req.query.user_key 或 req.body.user_key 提取并归一化用户标识，
 *   挂到 req.userKey 供下游路由直接使用。
 *   requireUserKey 守卫版本：缺失时直接返回 400 USER_REQUIRED。
 */
import type { Request, Response, NextFunction } from "express";
import { normalizeUserKey } from "../utils/normalize";

/** 扩展 Express Request 类型，下游路由可直接访问 req.userKey */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userKey: string;
    }
  }
}

/** 从 query 或 body 提取并归一化 userKey，未提供时返回空字符串 */
function parseUserKey(req: Request): string {
  const raw = String(req.query.user_key ?? req.body?.user_key ?? "");
  return normalizeUserKey(raw) || "";
}

/**
 * 提取 user_key 中间件（非守卫）：
 * 从 query 或 body 提取 user_key，归一化后挂到 req.userKey。
 * 未登录/空值时 req.userKey = ""（不阻断请求）。
 */
export function extractUserKey(req: Request, _res: Response, next: NextFunction): void {
  req.userKey = parseUserKey(req);
  next();
}

/**
 * user_key 守卫中间件：
 * 缺失时直接返回 400 { error: "USER_REQUIRED" }，不再往下走。
 */
export function requireUserKey(req: Request, res: Response, next: NextFunction): void {
  req.userKey = parseUserKey(req);
  if (!req.userKey) {
    res.status(400).json({ error: "USER_REQUIRED" });
    return;
  }
  next();
}
