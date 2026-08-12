/**
 * 认证中间件
 * Auth middleware — JWT + legacy fallback
 *
 * @module server/middleware/auth
 * @description 三种认证模式：
 *   1. `requireAuth`    — 必须携带有效 JWT Access Token，否则返回 401
 *   2. `optionalAuth`  — 尝试从 JWT 提取身份；JWT 缺失/无效时回退到 query/body user_key
 *   3. `extractUserKey` — 纯 legacy 模式（向后兼容），仅从 query/body 提取
 *
 *   全局默认使用 `optionalAuth`：JWT 优先 → legacy 回退。
 *   敏感路由使用 `requireAuth` 守卫。
 *
 *   当 JWT_SECRET 未配置时，所有中间件自动降级到 legacy 模式（信任 query/body user_key）。
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

/** 从 query 或 body 提取并归一化 userKey（legacy 模式） */
function parseUserKeyFromRequest(req: Request): string {
  const raw = String(req.query.user_key ?? req.body?.user_key ?? "");
  return normalizeUserKey(raw) || "";
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
 * JWT 优先 → legacy query/body user_key 回退。
 * 不阻断请求：无 Token 时 req.userKey 可能为空字符串。
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const jwtResult = extractJwtUserKey(req);
  if (jwtResult.valid && jwtResult.userKey) {
    req.userKey = jwtResult.userKey;
    req.authViaJwt = true;
  } else {
    // Legacy 回退：从 query/body 提取（向后兼容）
    req.userKey = parseUserKeyFromRequest(req);
    req.authViaJwt = false;
  }
  next();
}

/**
 * 强制认证守卫中间件
 * 必须携带有效 JWT Access Token，否则返回 401。
 * 当 JWT_SECRET 未配置时降级到 legacy 模式（不阻断）。
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const jwtResult = extractJwtUserKey(req);
  if (jwtResult.valid && jwtResult.userKey) {
    req.userKey = jwtResult.userKey;
    req.authViaJwt = true;
    return next();
  }

  // H-2 安全加固：仅开发环境允许 legacy 降级，生产环境必须配置 JWT_SECRET
  if (!process.env.JWT_SECRET && process.env.NODE_ENV !== "production") {
    const legacyKey = parseUserKeyFromRequest(req);
    if (legacyKey) {
      req.userKey = legacyKey;
      req.authViaJwt = false;
      return next();
    }
  }

  res.status(401).json({ error: "UNAUTHORIZED", message: "请先登录" });
}

/**
 * Legacy 提取中间件（向后兼容）
 * 仅从 query/body 提取 user_key，不做 JWT 验证。
 * 新代码应优先使用 optionalAuth 或 requireAuth。
 */
export function extractUserKey(req: Request, _res: Response, next: NextFunction): void {
  req.userKey = parseUserKeyFromRequest(req);
  req.authViaJwt = false;
  next();
}

/**
 * user_key 守卫中间件（legacy 版本，不验证 JWT）
 * 缺失时直接返回 400 { error: "USER_REQUIRED" }，不再往下走。
 * 新代码应优先使用 requireAuth。
 */
export function requireUserKey(req: Request, res: Response, next: NextFunction): void {
  req.userKey = parseUserKeyFromRequest(req);
  req.authViaJwt = false;
  if (!req.userKey) {
    res.status(400).json({ error: "USER_REQUIRED" });
    return;
  }
  next();
}
