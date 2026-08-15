/**
 * 认证子路由：注册
 * Auth Sub-router: Registration
 *
 * @module server/routes/auth/register.routes
 */
import crypto from "crypto";
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { hashPassword, hashVerificationCode } from "../../services/auth";
import { sendRegistrationVerifyEmail, isEmailConfigured } from "../../services/email";
import { validatePassword } from "../../utils/passwordPolicy";
import { extractClientIp } from "../../utils/ip";
import {
  signAccessToken, signRefreshToken, getRefreshTokenExpiresAt,
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

export function createRegisterRouter(
  ctx: AppContext,
  forgotRateLimiter: RateLimiter,
): Router {
  const router = Router();
  const usersRepo = ctx.usersRepo;

  // ── 注册：发送邮箱验证码 ──────────────────────────────────────────
  router.post("/api/auth/send-register-code", asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const rl = forgotRateLimiter.check(ip);
    if (rl.blocked) {
      return res.status(429).json({
        error: "发送过于频繁，请稍后重试",
        retry_after_seconds: rl.retryAfterSec,
      });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "请输入有效的邮箱地址" });
    }
    if (!isEmailConfigured()) {
      return res.status(503).json({ error: "邮件服务暂未配置，请稍后重试" });
    }

    // P1-4 安全加固：防邮箱枚举
    const existing = await usersRepo.findByKey(email);
    if (existing) {
      return res.json({
        success: true, email_sent: true,
        message: "验证码已发送到您的邮箱，请查收",
        support_hint: null,
      });
    }

    // M-3 安全加固：失效之前的未使用验证码
    await ctx.dbPool.execute(
      "UPDATE crm_password_resets SET used = 1 WHERE user_key = ? AND code_type = 'registration' AND used = 0",
      [email],
    );

    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const [insertResult] = await ctx.dbPool.execute(
      `INSERT INTO crm_password_resets (user_key, code, code_type, expires_at, ip)
       VALUES (?, ?, 'registration', ?, ?)`,
      [email, hashVerificationCode(code), expiresAt, ip],
    );
    const resetId = (insertResult as any).insertId;

    let emailSent = false;
    try {
      await sendRegistrationVerifyEmail(email, code);
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET email_sent = 1 WHERE id = ?",
        [resetId],
      );
      emailSent = true;
    } catch (err) {
      const errorMsg = (err as Error).message;
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET email_sent = 0, email_error = ? WHERE id = ?",
        [errorMsg, resetId],
      );
      console.error(`[register-code]  注册验证码邮件发送失败: ${email} - ${errorMsg}`);
    }

    if (emailSent) forgotRateLimiter.record(ip);

    res.json({
      success: true, email_sent: emailSent,
      support_hint: emailSent ? null : "邮件发送失败，请检查邮箱地址或稍后重试",
    });
  }));

  // ── 注册 ──────────────────────────────────────────
  router.post("/api/auth/register", asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const verifyCode = String(req.body.verify_code || "");
    const displayName = String(req.body.display_name || email.split("@")[0] || "会员");
    if (!email || !password) return res.status(400).json({ error: "邮箱和密码不能为空" });
    if (!verifyCode) return res.status(400).json({ error: "请输入邮箱验证码" });
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.message });

    const [codeRows] = await ctx.dbPool.query(
      `SELECT id, code, expires_at, attempts
       FROM crm_password_resets
       WHERE user_key = ? AND code_type = 'registration' AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    const codeRecord = (codeRows as any[])[0];

    if (!codeRecord) return res.status(400).json({ error: "验证码无效，请重新获取" });
    if (codeRecord.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
    if (codeRecord.code !== hashVerificationCode(verifyCode)) {
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?",
        [codeRecord.id],
      );
      return res.status(400).json({ error: "验证码无效，请重新获取" });
    }

    const existing = await usersRepo.findByKey(email);
    if (existing) return res.status(400).json({ error: "注册失败，请检查邮箱或验证码后重试" });

    const created = await usersRepo.create({
      user_key: email, email, display_name: displayName,
      password_hash: await hashPassword(password),
    });
    if (!created) return res.status(400).json({ error: "注册失败，请检查邮箱或验证码后重试" });

    await ctx.dbPool.execute("UPDATE crm_password_resets SET used = 1 WHERE id = ?", [codeRecord.id]);
    await usersRepo.markEmailVerified(email);

    let tokens: { token: string; refresh_token: string } | null = null;
    try { tokens = await issueTokenPair(ctx.dbPool, email, email); } catch { /* JWT_SECRET 未配置 */ }

    res.status(201).json({
      success: true,
      user: { user_key: email, email, display_name: displayName, membership_tier: "free" },
      ...tokens,
    });
  }));

  return router;
}
