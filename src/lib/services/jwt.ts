/**
 * JWT 身份认证工具模块
 * JWT Authentication Utilities
 *
 * @module server/services/jwt
 * @description Access Token / Refresh Token 的签发、验证与刷新。
 *              Access Token 有效期 2h（短生命周期，减少被盗用窗口）；
 *              Refresh Token 有效期 7d（长生命周期，支持无感续期）。
 *              密钥从环境变量 JWT_SECRET 读取；缺失时抛出错误，阻止启动。
 *
 *              crm_users.user_key 列退役路线图（迁移 062/065/066）代码侧收尾：
 *              payload 中已彻底移除 user_key 字段，uid 为唯一身份锚点。
 *              流通中的旧 token（无 uid 仅 user_key）将被 verifyXxxToken 直接拒绝。
 */
import jwt from "jsonwebtoken";
import crypto from "crypto";

// ── 配置 ──
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_EXPIRES = "2h";
const JWT_REFRESH_EXPIRES_DAYS = 7;

if (!JWT_SECRET) {
  // 启动时即报错，避免运行时才发现密钥缺失
  console.error("[jwt] ✗ JWT_SECRET 环境变量未配置，身份认证将不可用");
  // P1 安全加固：生产环境 fail-fast——缺失 JWT_SECRET 时阻止启动，
  // 避免"注册成功但无法登录"的诡异降级行为
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET 环境变量必须在生产环境中配置");
  }
}

// ── Token Payload 类型 ──
// uid 为唯一身份锚点（crm_users.id）；user_key/email 已彻底移除。
export interface AccessTokenPayload {
  /** 内部用户 ID（身份主锚点） */
  uid: number;
  type: "access";
}

export interface RefreshTokenPayload {
  /** 内部用户 ID（身份主锚点） */
  uid: number;
  type: "refresh";
}

// ── Access Token ──

/** 签发 Access Token（uid 必选，无其他身份字段） */
export function signAccessToken(payload: { uid: number }): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET_NOT_CONFIGURED");
  return jwt.sign(
    { uid: payload.uid, type: "access" } as AccessTokenPayload,
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES },
  );
}

/** 验证 Access Token，返回 payload；失败抛出 JsonWebTokenError / TokenExpiredError */
export function verifyAccessToken(token: string): AccessTokenPayload {
  if (!JWT_SECRET) throw new Error("JWT_SECRET_NOT_CONFIGURED");
  // 算法白名单（审查 F58）：显式限定 HS256，防 alg 混淆类回归
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as AccessTokenPayload;
  if (decoded.type !== "access") throw new Error("INVALID_TOKEN_TYPE");
  return decoded;
}

// ── Refresh Token ──

/** 签发 Refresh Token（同时返回明文 token 与哈希，哈希用于入库；uid 必选） */
export function signRefreshToken(payload: { uid: number }): { token: string; tokenHash: string } {
  if (!JWT_SECRET) throw new Error("JWT_SECRET_NOT_CONFIGURED");
  const token = jwt.sign(
    { uid: payload.uid, type: "refresh" } as RefreshTokenPayload,
    JWT_SECRET,
    { expiresIn: `${JWT_REFRESH_EXPIRES_DAYS}d` },
  );
  const tokenHash = hashRefreshToken(token);
  return { token, tokenHash };
}

/** 验证 Refresh Token，返回 payload */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  if (!JWT_SECRET) throw new Error("JWT_SECRET_NOT_CONFIGURED");
  // 算法白名单（审查 F58）：显式限定 HS256
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as RefreshTokenPayload;
  if (decoded.type !== "refresh") throw new Error("INVALID_TOKEN_TYPE");
  return decoded;
}

/** 对 Refresh Token 计算哈希（用于入库比对，SHA-256 即可） */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ── 工具函数 ──

/** 从 Authorization 头部提取 Bearer Token（缺失或格式错误返回 null） */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

/** 获取 Refresh Token 过期时间（Date 对象，供入库用） */
export function getRefreshTokenExpiresAt(): Date {
  return new Date(Date.now() + JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
}
