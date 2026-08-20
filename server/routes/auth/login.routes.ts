/**
 * 认证子路由：登录 / 用户信息 / Token 刷新 / 登出
 * Auth Sub-router: Login / User / Refresh / Logout
 *
 * @module server/routes/auth/login.routes
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { verifyPassword, needsUpgrade, buildUserResponse, hashPassword, issueTokenPair } from "../../services/auth";
import { extractClientIp } from "../../utils/ip";
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashRefreshToken,
  getRefreshTokenExpiresAt,
} from "../../services/jwt";
import type { RateLimiter } from "../../middleware/rateLimiter";
// B2【P1】安全加固：Refresh Token 从 localStorage 迁移到 HttpOnly Cookie
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from "../../utils/auth-cookies";

export function createLoginRouter(
  ctx: AppContext,
  loginRateLimiter: RateLimiter,
  accountRateLimiter: RateLimiter,
): Router {
  const router = Router();
  const usersRepo = ctx.user.usersRepo;
  const authRepo = ctx.user.authRepo;
  const membershipRepo = ctx.user.membershipRepo;
  const registrationRepo = ctx.supplier.registrationRepo;

  // ── 登录 ──────────────────────────────────────────
  router.post("/api/auth/login", asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);

    const rateLimit = loginRateLimiter.check(ip);
    if (rateLimit.blocked) {
      return res.status(429).json({
        error: "登录尝试过于频繁，请稍后重试",
        retry_after_seconds: rateLimit.retryAfterSec,
      });
    }

    const identifier = String(req.body.email || "").trim();
    const isPhoneLogin = /^1[3-9]\d{9}$/.test(identifier);

    let user: import("../../repos/types").UserRow | null = null;
    let accountKey = identifier.toLowerCase();

    if (isPhoneLogin) {
      user = await usersRepo.findByPhone(identifier);
      if (user) accountKey = (user.user_key || "").toLowerCase();
    } else {
      user = await usersRepo.findAuthByKey(identifier.toLowerCase());
    }

    const accountLimit = accountRateLimiter.check(accountKey);
    if (accountLimit.blocked) {
      return res.status(429).json({
        error: "该账号登录尝试过于频繁，请稍后重试",
        retry_after_seconds: accountLimit.retryAfterSec,
      });
    }

    const password = String(req.body.password || "");
    const hashType = user?.password_hash_type ?? "sha256";
    if (!user || !user.password_hash) {
      await verifyPassword(password, "$2b$12$AAAAAAAAAAAAAAAAAAAAAAOqGHn2kLJ3xQ4y5m6n7p8r9s0t1u2v3w", "bcrypt");
      loginRateLimiter.record(ip);
      accountRateLimiter.record(accountKey);
      return res.status(401).json({ error: "账号或密码错误" });
    }
    if (!(await verifyPassword(password, user.password_hash, hashType))) {
      loginRateLimiter.record(ip);
      accountRateLimiter.record(accountKey);
      return res.status(401).json({ error: "账号或密码错误" });
    }
    if (user.account_status === "disabled" || user.account_status === "rejected") {
      return res.status(403).json({ error: "账号未通过审核或已停用" });
    }

    loginRateLimiter.clear(ip);
    accountRateLimiter.clear(accountKey);

    if (needsUpgrade(hashType)) {
      const newHash = await hashPassword(password);
      await usersRepo.updatePassword(user.user_key, newHash, "bcrypt");
    }

    const payload = await buildUserResponse(user, membershipRepo, registrationRepo);
    let tokens: { token: string; refresh_token: string } | null = null;
    try {
      tokens = await issueTokenPair(authRepo, user.user_key, user.email || "");
    } catch { /* JWT_SECRET 未配置，静默降级 */ }
    // B2【P1】Refresh Token 写入 HttpOnly Cookie（前端不再存 localStorage）
    if (tokens) setRefreshCookie(res, tokens.refresh_token);
    // #5（2026-08-20）：响应体不再下发 refresh_token 明文（Cookie 已由服务端设置），
    // 收敛日志/中间件捕获面；仅返回 Access Token
    res.json({ success: true, user: payload, token: tokens?.token });
  }));

  // ── 获取用户信息 ──────────────────────────────────────────
  router.get("/api/auth/user", asyncHandler(async (req, res) => {
    if (!req.userKey) return res.status(400).json({ error: "USER_REQUIRED" });
    if (!req.authViaJwt) {
      return res.status(403).json({ error: "FORBIDDEN", message: "请通过有效凭证访问" });
    }
    const user = await usersRepo.findProfileByKey(req.userKey);
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });
    const payload = await buildUserResponse(user, membershipRepo, registrationRepo);
    res.json({ success: true, user: payload });
  }));

  // ── Token 刷新 ──────────────────────────────────────────
  router.post("/api/auth/refresh", asyncHandler(async (req, res) => {
    // #5（2026-08-20）：body 兜底通道已移除——前端已全量迁移 HttpOnly Cookie，
    // Refresh Token 唯一来源为 Cookie（浏览器自动携带）
    const refreshToken = readRefreshCookie(req) || "";
    if (!refreshToken) return res.status(400).json({ error: "REFRESH_TOKEN_REQUIRED" });

    let payload: { user_key: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await authRepo.findRefreshTokenByHash(tokenHash);
    if (!stored) return res.status(401).json({ error: "REFRESH_TOKEN_REVOKED" });

    const user = await usersRepo.findProfileByKey(payload.user_key);
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    // P3-4 安全修复：Refresh Token 轮换——旧 token 立即失效，签发新 token 对；
    // 被窃取后重放的旧 refresh token 将命中 REFRESH_TOKEN_REVOKED，暴露盗用
    const newAccessToken = signAccessToken({
      user_key: payload.user_key,
      email: (user as any).email || "",
    });
    const { token: newRefreshToken, tokenHash: newTokenHash } = signRefreshToken({ user_key: payload.user_key });
    await authRepo.deleteRefreshTokenByHash(tokenHash);
    await authRepo.insertRefreshToken(payload.user_key, newTokenHash, getRefreshTokenExpiresAt());
    // B2【P1】新 Refresh Token 写入 HttpOnly Cookie（轮换）
    setRefreshCookie(res, newRefreshToken);
    // #5：响应体不再携带 refresh_token 明文，仅下发新 Access Token
    res.json({ success: true, token: newAccessToken });
  }));

  // ── 登出 ──────────────────────────────────────────
  router.post("/api/auth/logout", asyncHandler(async (req, res) => {
    // #5（2026-08-20）：body 兜底通道已移除，Refresh Token 仅从 Cookie 读取
    const refreshToken = readRefreshCookie(req) || "";
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await authRepo.deleteRefreshTokenByHash(tokenHash);
    }
    // B2【P1】清除 Refresh Token Cookie
    clearRefreshCookie(res);
    // Access Token 短生命周期（2h）自然过期，无需服务端吊销表；
    // 不再执行 DELETE WHERE user_key 的批量吊销
    res.json({ success: true });
  }));

  return router;
}
