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
import { hashPassword, hashVerificationCode, buildUserResponse } from "../../services/auth";
import { sendPasswordResetEmail, isEmailConfigured } from "../../services/email";
import { sendSmsVerificationCode, isSmsConfigured, getSmsResetTemplateCode } from "../../services/sms";
import { validatePassword } from "../../utils/passwordPolicy";
import { maskPhone } from "../../utils/mask";
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

export function createPasswordRouter(
  ctx: AppContext,
  forgotRateLimiter: RateLimiter,
  phoneSmsRateLimiter: RateLimiter,
): Router {
  const router = Router();
  const usersRepo = ctx.user.usersRepo;
  const membershipRepo = ctx.user.membershipRepo;
  const suppliersRepo = ctx.supplier.suppliersRepo;

  // ── 检查邮箱是否绑定手机号 ──────────────────────────────────────────
  router.post("/api/auth/check-email-phone", asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "请输入有效的邮箱地址" });
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
      return res.status(429).json({
        error: "发送过于频繁，请稍后重试",
        retry_after_seconds: rl.retryAfterSec,
      });
    }

    const identifier = String(req.body.email || "").trim().toLowerCase();

    // ── 手机验证渠道 ──
    if (channel === "sms") {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
        return res.json({ success: true, message: "验证码发送请求已提交", sms_sent: false, support_hint: null });
      }
      let email = identifier;
      if (!identifier || !/^1[3-9]\d{9}$/.test(identifier)) {
        return res.status(400).json({ error: "请输入有效的手机号" });
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
        return res.status(503).json({ error: "短信服务暂未配置，请使用邮箱验证" });
      }

      const phoneRl = phoneSmsRateLimiter.check(user.phone);
      if (phoneRl.blocked) {
        return res.status(429).json({ error: "验证码发送过于频繁，请稍后重试", retry_after_seconds: phoneRl.retryAfterSec });
      }

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const code = String(crypto.randomInt(100000, 1000000));
      const [insertResult] = await ctx.dbPool.execute(
        `INSERT INTO crm_password_resets (user_key, phone, code, code_type, expires_at, ip)
         VALUES (?, ?, ?, 'phone_reset', ?, ?)`,
        [email, user.phone, hashVerificationCode(code), expiresAt, ip],
      );
      const resetId = (insertResult as any).insertId;

      let smsSent = false;
      try {
        await sendSmsVerificationCode(user.phone, getSmsResetTemplateCode(), code);
        smsSent = true;
        await ctx.dbPool.execute("UPDATE crm_password_resets SET sms_sent = 1 WHERE id = ?", [resetId]);
      } catch (err) {
        const errorMsg = (err as Error).message;
        console.error(`[forgot-password/sms] ✗ 短信发送失败: ${maskPhone(user.phone)} - ${errorMsg}`);
        await ctx.dbPool.execute(
          "UPDATE crm_password_resets SET sms_sent = 0, sms_error = ? WHERE id = ?",
          [errorMsg, resetId],
        );
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
      return res.status(400).json({ error: "请输入有效的邮箱地址" });
    }
    if (!isEmailConfigured()) {
      return res.status(503).json({ error: "邮件服务暂未配置，请联系客服重置密码" });
    }

    const user = await usersRepo.findByKey(email);
    let emailSent = true;
    if (user) {
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET used = 1 WHERE user_key = ? AND code_type = 'email_reset' AND used = 0",
        [email],
      );

      const code = String(crypto.randomInt(100000, 1000000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const [insertResult] = await ctx.dbPool.execute(
        `INSERT INTO crm_password_resets (user_key, code, code_type, expires_at, ip)
         VALUES (?, ?, 'email_reset', ?, ?)`,
        [email, hashVerificationCode(code), expiresAt, ip],
      );
      const resetId = (insertResult as any).insertId;

      try {
        await sendPasswordResetEmail(email, code);
        await ctx.dbPool.execute("UPDATE crm_password_resets SET email_sent = 1 WHERE id = ?", [resetId]);
        console.log(`[forgot-password] ✓ 验证码邮件发送成功: ${email}`);
        emailSent = true;
      } catch (err) {
        const errorMsg = (err as Error).message;
        await ctx.dbPool.execute(
          "UPDATE crm_password_resets SET email_sent = 0, email_error = ? WHERE id = ?",
          [errorMsg, resetId],
        );
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
      return res.status(429).json({ error: "操作过于频繁，请稍后重试", retry_after_seconds: rl.retryAfterSec });
    }

    const identifier = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.new_password || "");
    const channel = String(req.body.channel || "email").trim();

    if (!identifier || !code || !newPassword) {
      return res.status(400).json({ error: "请填写完整信息" });
    }
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.message });

    let email = identifier;
    if (channel === "sms" && /^1[3-9]\d{9}$/.test(identifier)) {
      const byPhone = await usersRepo.findByPhone(identifier);
      if (!byPhone || !byPhone.user_key) {
        return res.status(400).json({ error: "验证码无效，请重新获取" });
      }
      email = byPhone.user_key;
    }

    let record: any;
    if (channel === "sms") {
      const [rows] = await ctx.dbPool.query(
        `SELECT id, code, expires_at, attempts
         FROM crm_password_resets
         WHERE user_key = ? AND code_type = 'phone_reset' AND used = 0 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email],
      );
      const smsRecord = (rows as any[])[0];
      if (smsRecord) {
        const [phoneCheck] = await ctx.dbPool.query(
          "SELECT phone FROM crm_password_resets WHERE id = ? AND phone IS NOT NULL LIMIT 1",
          [smsRecord.id],
        );
        const phoneRow = (phoneCheck as any[])[0];
        if (phoneRow && phoneRow.phone) {
          const currentUser = await usersRepo.findByKey(email);
          if (!currentUser || currentUser.phone !== phoneRow.phone) {
            return res.status(400).json({ error: "验证码无效，请重新获取" });
          }
        }
      }
      record = smsRecord;
    } else {
      const [rows] = await ctx.dbPool.query(
        `SELECT id, code, expires_at, attempts
         FROM crm_password_resets
         WHERE user_key = ? AND code_type = 'email_reset' AND used = 0 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email],
      );
      record = (rows as any[])[0];
    }

    if (!record) return res.status(400).json({ error: "验证码无效，请重新获取" });
    if (record.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });

    if (record.code !== hashVerificationCode(code)) {
      await ctx.dbPool.execute(
        "UPDATE crm_password_resets SET attempts = attempts + 1 WHERE id = ?",
        [record.id],
      );
      return res.status(400).json({ error: "验证码无效，请重新获取" });
    }

    const newHash = await hashPassword(newPassword);
    await usersRepo.updatePassword(email, newHash, "bcrypt");

    // H-1 安全加固：密码重置后撤销所有现有 Refresh Token
    await ctx.dbPool.execute("DELETE FROM crm_refresh_tokens WHERE user_key = ?", [email]);

    if (channel !== "sms") {
      await usersRepo.markEmailVerified(email);
    }

    await ctx.dbPool.execute("UPDATE crm_password_resets SET used = 1 WHERE id = ?", [record.id]);

    const user = await usersRepo.findAuthByKey(email);
    if (!user) return res.status(500).json({ error: "重置成功，但获取用户信息失败，请重新登录" });
    const payload = await buildUserResponse(user, membershipRepo, suppliersRepo);
    let tokens: { token: string; refresh_token: string } | null = null;
    try { tokens = await issueTokenPair(ctx.dbPool, user.user_key, user.email || ""); } catch { /* JWT_SECRET 未配置 */ }
    res.json({ success: true, user: payload, ...tokens });
  }));

  return router;
}
