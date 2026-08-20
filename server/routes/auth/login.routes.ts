/**
 * 认证子路由：登录 / 用户信息 / Token 刷新 / 登出
 * Auth Sub-router: Login / User / Refresh / Logout
 *
 * @module server/routes/auth/login.routes
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { verifyPassword, needsUpgrade, buildUserResponse, hashPassword } from "../../services/auth";
import { extractClientIp } from "../../utils/ip";
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashRefreshToken,
  getRefreshTokenExpiresAt,
} from "../../services/jwt";
import type { RateLimiter } from "../../middleware/rateLimiter";

/** 签发 JWT Token 对 */
async function issueTokenPair(
  dbPool: import("mysql2/promise").Pool,
  userKey: string,
  email: string,
): Promise<{ token: string; refresh_token: string }> {
  const accessToken = signAccessToken({ user_key: userKey, email });
  const { token: refreshToken, tokenHash } = signRefreshToken({ user_key: userKey });
  const expiresAt = getRefreshTokenExpiresAt();
  void dbPool.execute(
    "INSERT INTO crm_refresh_tokens (user_key, token_hash, expires_at) VALUES (?, ?, ?)",
    [userKey, tokenHash, expiresAt],
  ).catch((err) => console.error("[jwt] refresh token 入库失败:", (err as Error).message));
  return { token: accessToken, refresh_token: refreshToken };
}

export function createLoginRouter(
  ctx: AppContext,
  loginRateLimiter: RateLimiter,
  accountRateLimiter: RateLimiter,
): Router {
  const router = Router();
  const usersRepo = ctx.user.usersRepo;
  const membershipRepo = ctx.user.membershipRepo;
  const suppliersRepo = ctx.supplier.suppliersRepo;

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

    const payload = await buildUserResponse(user, membershipRepo, suppliersRepo);
    let tokens: { token: string; refresh_token: string } | null = null;
    try {
      tokens = await issueTokenPair(ctx.dbPool, user.user_key, user.email || "");
    } catch { /* JWT_SECRET 未配置，静默降级 */ }
    res.json({ success: true, user: payload, ...tokens });
  }));

  // ── 获取用户信息 ──────────────────────────────────────────
  router.get("/api/auth/user", asyncHandler(async (req, res) => {
    if (!req.userKey) return res.status(400).json({ error: "USER_REQUIRED" });
    if (!req.authViaJwt) {
      return res.status(403).json({ error: "FORBIDDEN", message: "请通过有效凭证访问" });
    }
    const user = await usersRepo.findProfileByKey(req.userKey);
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });
    const payload = await buildUserResponse(user, membershipRepo, suppliersRepo);
    res.json({ success: true, user: payload });
  }));

  // ── Token 刷新 ──────────────────────────────────────────
  router.post("/api/auth/refresh", asyncHandler(async (req, res) => {
    const refreshToken = String(req.body.refresh_token || "").trim();
    if (!refreshToken) return res.status(400).json({ error: "REFRESH_TOKEN_REQUIRED" });

    let payload: { user_key: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const [rows] = await ctx.dbPool.query(
      "SELECT id, user_key FROM crm_refresh_tokens WHERE token_hash = ? AND expires_at > NOW() LIMIT 1",
      [tokenHash],
    );
    const stored = (rows as any[])[0];
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
    await ctx.dbPool.execute("DELETE FROM crm_refresh_tokens WHERE token_hash = ?", [tokenHash]);
    await ctx.dbPool.execute(
      "INSERT INTO crm_refresh_tokens (user_key, token_hash, expires_at) VALUES (?, ?, ?)",
      [payload.user_key, newTokenHash, getRefreshTokenExpiresAt()],
    );
    res.json({ success: true, token: newAccessToken, refresh_token: newRefreshToken });
  }));

  // ── 登出 ──────────────────────────────────────────
  router.post("/api/auth/logout", asyncHandler(async (req, res) => {
    // P3-4 安全修复：登出仅吊销当前会话的 refresh token（按 token_hash 精确删除），
    // 不再按 user_key 批量删除——避免用户在 A 设备登出时误杀 B/C 设备的会话
    const refreshToken = String(req.body.refresh_token || "").trim();
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await ctx.dbPool.execute("DELETE FROM crm_refresh_tokens WHERE token_hash = ?", [tokenHash]);
    }
    // Access Token 短生命周期（2h）自然过期，无需服务端吊销表；
    // 不再执行 DELETE WHERE user_key 的批量吊销
    res.json({ success: true });
  }));

  return router;
}
