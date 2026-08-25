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
import { hashPassword, hashVerificationCode, issueTokenPair } from "../../services/auth";
import { sendRegistrationVerifyEmail, isEmailConfigured } from "../../services/email";
import { validatePassword } from "../../utils/passwordPolicy";
import { extractClientIp } from "../../utils/ip";
import { sendError, ApiErrorCode } from "../../utils/http-error";
import type { RateLimiter } from "../../middleware/rateLimiter";
// B2【P1】Refresh Token 写入 HttpOnly Cookie
import { setRefreshCookie } from "../../utils/auth-cookies";

export function createRegisterRouter(
  ctx: AppContext,
  forgotRateLimiter: RateLimiter,
): Router {
  const router = Router();
  const usersRepo = ctx.user.usersRepo;
  const authRepo = ctx.user.authRepo;

  // ── 注册：发送邮箱验证码 ──────────────────────────────────────────
  router.post("/api/auth/send-register-code", asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const rl = forgotRateLimiter.check(ip);
    if (rl.blocked) {
      return sendError(res, 429, ApiErrorCode.RATE_LIMITED, "发送过于频繁，请稍后重试", { retry_after_seconds: rl.retryAfterSec });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendError(res, 400, ApiErrorCode.INVALID_EMAIL, "请输入有效的邮箱地址");
    }
    if (!isEmailConfigured()) {
      return sendError(res, 503, ApiErrorCode.EMAIL_NOT_CONFIGURED, "邮件服务暂未配置，请稍后重试");
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
    await authRepo.invalidateUnusedCodes(email, "registration");

    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const resetId = await authRepo.createResetCode({
      userKey: email,
      codeHash: hashVerificationCode(code),
      codeType: "registration",
      expiresAt,
      ip,
    });

    let emailSent = false;
    try {
      await sendRegistrationVerifyEmail(email, code);
      await authRepo.markEmailSent(resetId, true);
      emailSent = true;
    } catch (err) {
      const errorMsg = (err as Error).message;
      await authRepo.markEmailSent(resetId, false, errorMsg);
      console.error(`[register-code]  注册验证码邮件发送失败: ${email} - ${errorMsg}`);
    }

    if (emailSent) forgotRateLimiter.record(ip);

    res.json({
      success: true, email_sent: emailSent,
      support_hint: emailSent ? null : "邮件发送失败，请检查邮箱地址或稍后重试",
    });
  }));

  // ── 注册 ──────────────────────────────────────────
  // P3 安全加固：注册端点增加速率限制，防止验证码暴力枚举
  router.post("/api/auth/register", asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const rl = forgotRateLimiter.check(ip);
    if (rl.blocked) {
      return sendError(res, 429, ApiErrorCode.RATE_LIMITED, "注册过于频繁，请稍后重试", { retry_after_seconds: rl.retryAfterSec });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const verifyCode = String(req.body.verify_code || "");
    const displayName = String(req.body.display_name || email.split("@")[0] || "会员");
    if (!email || !password) return sendError(res, 400, ApiErrorCode.EMAIL_PASSWORD_REQUIRED, "邮箱和密码不能为空");
    if (!verifyCode) return sendError(res, 400, ApiErrorCode.VERIFY_CODE_REQUIRED, "请输入邮箱验证码");
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return sendError(res, 400, ApiErrorCode.INVALID_PASSWORD, pwCheck.message);

    const codeRecord = await authRepo.findLatestActiveCode(email, "registration");

    if (!codeRecord) return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
    if (codeRecord.attempts >= 5) return sendError(res, 429, ApiErrorCode.TOO_MANY_ATTEMPTS, "尝试次数过多，请重新获取验证码");
    if (codeRecord.code !== hashVerificationCode(verifyCode)) {
      await authRepo.incrementCodeAttempts(codeRecord.id);
      forgotRateLimiter.record(ip);
      return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
    }

    const existing = await usersRepo.findByKey(email);
    if (existing) return sendError(res, 400, ApiErrorCode.REGISTRATION_FAILED, "注册失败，请检查邮箱或验证码后重试");

    const created = await usersRepo.create({
      user_key: email, email, display_name: displayName,
      password_hash: await hashPassword(password),
    });
    if (!created) return sendError(res, 400, ApiErrorCode.REGISTRATION_FAILED, "注册失败，请检查邮箱或验证码后重试");

    await authRepo.markCodeUsed(codeRecord.id);
    await usersRepo.markEmailVerified(email);

    let tokens: { token: string; refresh_token: string } | null = null;
    try { tokens = await issueTokenPair(authRepo, email, email); } catch { /* JWT_SECRET 未配置 */ }
    if (tokens) setRefreshCookie(res, tokens.refresh_token);

    res.status(201).json({
      success: true,
      user: { user_key: email, email, display_name: displayName, membership_tier: "free" },
      // #5：响应体不再下发 refresh_token 明文（Cookie 已由服务端设置）
      token: tokens?.token,
    });
  }));

  return router;
}
