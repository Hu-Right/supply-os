/**
 * 认证子路由：密码找回 / 重置 / 检查邮箱手机
 * Auth Sub-router: Password Recovery & Reset
 *
 * @module server/routes/auth/password.routes
 */
import crypto from "crypto";
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { hashPassword, hashVerificationCode, buildUserResponse, issueTokenPair } from "../../services/auth";
import { sendPasswordResetEmail, isEmailConfigured } from "../../services/email";
import { sendSmsVerificationCode, isSmsConfigured, getSmsResetTemplateCode } from "../../services/sms";
import { validatePassword } from "../../utils/passwordPolicy";
import { maskPhone } from "../../utils/mask";
import { extractClientIp } from "../../utils/ip";
import { sendError, ApiErrorCode } from "../../utils/http-error";
import type { RateLimiter } from "../../middleware/rateLimiter";
// B2【P1】Refresh Token 写入 HttpOnly Cookie
import { setRefreshCookie } from "../../utils/auth-cookies";

export function createPasswordRouter(
  ctx: AppContext,
  forgotRateLimiter: RateLimiter,
  phoneSmsRateLimiter: RateLimiter,
): Router {
  const router = Router();
  const usersRepo = ctx.user.usersRepo;
  const authRepo = ctx.user.authRepo;
  const membershipRepo = ctx.user.membershipRepo;
  const registrationRepo = ctx.supplier.registrationRepo;

  // ── 检查邮箱是否绑定手机号 ──────────────────────────────────────────
  router.post("/api/auth/check-email-phone", asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendError(res, 400, ApiErrorCode.INVALID_EMAIL, "请输入有效的邮箱地址");
    }
    const user = await usersRepo.findByKey(email);
    if (!user || !user.phone || !user.phone_verified) {
      return res.json({ has_phone: false });
    }
    return res.json({ has_phone: true, phone: maskPhone(user.phone) });
  }));

  // ── 找回密码：发送验证码 ──────────────────────────────────────────
  router.post("/api/auth/forgot-password", asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const channel = String(req.body.channel || "email").trim();

    const rl = forgotRateLimiter.check(ip);
    if (rl.blocked) {
      return sendError(res, 429, ApiErrorCode.RATE_LIMITED, "发送过于频繁，请稍后重试", { retry_after_seconds: rl.retryAfterSec });
    }

    const identifier = String(req.body.email || "").trim().toLowerCase();

    // ── 手机验证渠道 ──
    if (channel === "sms") {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
        return res.json({ success: true, message: "验证码发送请求已提交", sms_sent: false, support_hint: null });
      }
      let email = identifier;
      if (!identifier || !/^1[3-9]\d{9}$/.test(identifier)) {
        return sendError(res, 400, ApiErrorCode.INVALID_PHONE, "请输入有效的手机号");
      }
      if (/^1[3-9]\d{9}$/.test(identifier)) {
        const byPhone = await usersRepo.findByPhone(identifier);
        if (!byPhone || !byPhone.user_key) {
          forgotRateLimiter.record(ip);
          return res.json({ success: true, message: "验证码发送请求已提交", sms_sent: false, support_hint: null });
        }
        email = byPhone.user_key;
      }
      const user = await usersRepo.findByKey(email);
      if (!user || !user.phone || !user.phone_verified) {
        forgotRateLimiter.record(ip);
        return res.json({ success: true, message: "验证码发送请求已提交", sms_sent: false, support_hint: null });
      }

      if (!isSmsConfigured()) {
        return sendError(res, 503, ApiErrorCode.SMS_NOT_CONFIGURED, "短信服务暂未配置，请使用邮箱验证");
      }

      const phoneRl = phoneSmsRateLimiter.check(user.phone);
      if (phoneRl.blocked) {
        return sendError(res, 429, ApiErrorCode.RATE_LIMITED, "验证码发送过于频繁，请稍后重试", { retry_after_seconds: phoneRl.retryAfterSec });
      }

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const code = String(crypto.randomInt(100000, 1000000));
      const resetId = await authRepo.createResetCode({
        userKey: email,
        phone: user.phone,
        codeHash: hashVerificationCode(code),
        codeType: "phone_reset",
        expiresAt,
        ip,
      });

      let smsSent = false;
      try {
        await sendSmsVerificationCode(user.phone, getSmsResetTemplateCode(), code);
        smsSent = true;
        await authRepo.markSmsSent(resetId, true);
      } catch (err) {
        const errorMsg = (err as Error).message;
        console.error(`[forgot-password/sms] ✗ 短信发送失败: ${maskPhone(user.phone)} - ${errorMsg}`);
        await authRepo.markSmsSent(resetId, false, errorMsg);
      }

      phoneSmsRateLimiter.record(user.phone);
      forgotRateLimiter.record(ip);

      return res.json({
        success: true, message: "验证码已发送到您的手机",
        sms_sent: smsSent,
        support_hint: smsSent ? null : "短信发送失败，请使用邮箱验证或联系客服",
      });
    }

    // ── 邮箱验证渠道（默认） ──
    const email = identifier;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendError(res, 400, ApiErrorCode.INVALID_EMAIL, "请输入有效的邮箱地址");
    }
    if (!isEmailConfigured()) {
      return sendError(res, 503, ApiErrorCode.EMAIL_NOT_CONFIGURED, "邮件服务暂未配置，请联系客服重置密码");
    }

    const user = await usersRepo.findByKey(email);
    let emailSent = true;
    if (user) {
      await authRepo.invalidateUnusedCodes(email, "email_reset");

      const code = String(crypto.randomInt(100000, 1000000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const resetId = await authRepo.createResetCode({
        userKey: email,
        codeHash: hashVerificationCode(code),
        codeType: "email_reset",
        expiresAt,
        ip,
      });

      try {
        await sendPasswordResetEmail(email, code);
        await authRepo.markEmailSent(resetId, true);
        console.log(`[forgot-password] ✓ 验证码邮件发送成功: ${email}`);
        emailSent = true;
      } catch (err) {
        const errorMsg = (err as Error).message;
        await authRepo.markEmailSent(resetId, false, errorMsg);
        console.error(`[forgot-password] ✗ 验证码邮件发送失败: ${email} - ${errorMsg}`);
        emailSent = false;
      }
    }

    forgotRateLimiter.record(ip);

    res.json({
      success: true, message: "验证码已发送到您的邮箱",
      email_sent: emailSent,
      support_hint: emailSent ? null : "邮件发送失败，请联系客服协助重置密码",
    });
  }));

  // ── 找回密码：重置密码 ──────────────────────────────────────────
  router.post("/api/auth/reset-password", asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const rl = forgotRateLimiter.check(ip);
    if (rl.blocked) {
      return sendError(res, 429, ApiErrorCode.RATE_LIMITED, "操作过于频繁，请稍后重试", { retry_after_seconds: rl.retryAfterSec });
    }

    const identifier = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.new_password || "");
    const channel = String(req.body.channel || "email").trim();

    if (!identifier || !code || !newPassword) {
      return sendError(res, 400, ApiErrorCode.INCOMPLETE_FIELDS, "请填写完整信息");
    }
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) return sendError(res, 400, ApiErrorCode.INVALID_PASSWORD, pwCheck.message);

    let email = identifier;
    if (channel === "sms" && /^1[3-9]\d{9}$/.test(identifier)) {
      const byPhone = await usersRepo.findByPhone(identifier);
      if (!byPhone || !byPhone.user_key) {
        return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
      }
      email = byPhone.user_key;
    }

    let record: import("../../repos/auth.repo").AuthCodeRow | null;
    if (channel === "sms") {
      const smsRecord = await authRepo.findLatestActiveCode(email, "phone_reset");
      if (smsRecord) {
        const codePhone = await authRepo.findCodePhone(smsRecord.id);
        if (codePhone) {
          const currentUser = await usersRepo.findByKey(email);
          if (!currentUser || currentUser.phone !== codePhone) {
            return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
          }
        }
      }
      record = smsRecord;
    } else {
      record = await authRepo.findLatestActiveCode(email, "email_reset");
    }

    if (!record) return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
    if (record.attempts >= 5) return sendError(res, 429, ApiErrorCode.TOO_MANY_ATTEMPTS, "尝试次数过多，请重新获取验证码");

    if (record.code !== hashVerificationCode(code)) {
      await authRepo.incrementCodeAttempts(record.id);
      return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
    }

    const newHash = await hashPassword(newPassword);
    await usersRepo.updatePassword(email, newHash, "bcrypt");

    // H-1 安全加固：密码重置后撤销所有现有 Refresh Token
    await authRepo.deleteRefreshTokensByUser(email);

    if (channel !== "sms") {
      await usersRepo.markEmailVerified(email);
    }

    await authRepo.markCodeUsed(record.id);

    const user = await usersRepo.findAuthByKey(email);
    if (!user) return sendError(res, 500, ApiErrorCode.INTERNAL_ERROR, "重置成功，但获取用户信息失败，请重新登录");
    const payload = await buildUserResponse(user, membershipRepo, registrationRepo);
    let tokens: { token: string; refresh_token: string } | null = null;
    try { tokens = await issueTokenPair(authRepo, user.user_key, user.email || ""); } catch { /* JWT_SECRET 未配置 */ }
    if (tokens) setRefreshCookie(res, tokens.refresh_token);
    // #5：响应体不再下发 refresh_token 明文（Cookie 已由服务端设置）
    res.json({ success: true, user: payload, token: tokens?.token });
  }));

  return router;
}
