/**
 * 认证中间件
 * Auth middleware — JWT only
 *
 * @module server/middleware/auth
 * @description 两种认证模式：
 *   1. `requireAuth`   — 必须携带有效 JWT Access Token，否则返回 401
 *   2. `optionalAuth`  — 尝试从 JWT 提取身份；无 Token 时 req.userKey 为空串（匿名）
 *
 *   全局默认使用 `optionalAuth`；敏感路由使用 `requireAuth` 守卫。
 *
 *   B1 legacy user_key 通道已于 2026-08-19 完全退役：optionalAuth 的
 *   query/body user_key 回退分支、extractUserKey / requireUserKey 中间件、
 *   requireAuth 的开发环境 legacy 降级均已删除（见《legacy 通道清点报告》）。
 *   身份唯一来源为 JWT，user_key 不再作为身份凭证参与认证。
 */
import type { Request, Response, NextFunction } from "express";
import { normalizeUserKey } from "../utils/normalize";
import { verifyAccessToken, extractBearerToken, type AccessTokenPayload } from "../services/jwt";

/** 扩展 Express Request 类型，下游路由可直接访问 req.userKey */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userKey: string;
      /** JWT 认证标记：true 表示通过 JWT 验证（非伪造） */
      authViaJwt: boolean;
    }
  }
}

/** 尝试从 Authorization 头部提取 JWT 并验证 */
function extractJwtUserKey(req: Request): { userKey: string; valid: boolean } {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return { userKey: "", valid: false };
  try {
    const payload = verifyAccessToken(token);
    return { userKey: normalizeUserKey(payload.user_key) || "", valid: true };
  } catch {
    return { userKey: "", valid: false };
  }
}

/**
 * 可选认证中间件（全局默认）
 * 仅从 JWT 提取身份；无 Token/无效时 req.userKey 为空串（匿名访问）。
 * B1 legacy 退役（2026-08-19）：query/body user_key 回退分支已删除。
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const jwtResult = extractJwtUserKey(req);
  req.userKey = jwtResult.valid ? jwtResult.userKey : "";
  req.authViaJwt = jwtResult.valid;
  next();
}

/**
 * 强制认证守卫中间件
 * 必须携带有效 JWT Access Token，否则返回 401。
 * B1 legacy 退役（2026-08-19）：开发环境 legacy 降级已删除（.env 已配置 JWT_SECRET，
 * 本地开发同样走 JWT 流程）。
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const jwtResult = extractJwtUserKey(req);
  if (jwtResult.valid && jwtResult.userKey) {
    req.userKey = jwtResult.userKey;
    req.authViaJwt = true;
    return next();
  }
  res.status(401).json({ error: "UNAUTHORIZED", message: "请先登录" });
}
