/**
 * 认证子路由：手机号管理（发送验证码 / 绑定 / 换绑 / 解绑）
 * Auth Sub-router: Phone Management
 *
 * @module server/routes/auth/phone.routes
 */
import crypto from "crypto";
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { hashVerificationCode } from "../../services/auth";
import { sendSmsVerificationCode, isSmsConfigured, getSmsResetTemplateCode } from "../../services/sms";
import { maskPhone } from "../../utils/mask";
import { extractClientIp } from "../../utils/ip";
import { requireAuth } from "../../middleware/auth";
import { sendError, ApiErrorCode } from "../../utils/http-error";
import type { RateLimiter } from "../../middleware/rateLimiter";

/** 中国大陆手机号正则 */
const PHONE_REGEX = /^1[3-9]\d{9}$/;

export function createPhoneRouter(
  ctx: AppContext,
  forgotRateLimiter: RateLimiter,
  phoneSmsRateLimiter: RateLimiter,
): Router {
  const router = Router();
  const usersRepo = ctx.user.usersRepo;
  const authRepo = ctx.user.authRepo;

  // ── 发送手机验证码 ──────────────────────────────────────────
  router.post("/api/auth/send-phone-code", requireAuth, asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const userKey = req.userKey || "";
    const phone = String(req.body.phone || "").trim();
    const scene = String(req.body.scene || "bind");

    if (!userKey) return sendError(res, 400, ApiErrorCode.USER_REQUIRED, "请先登录");
    if (!["bind", "rebind", "unbind", "reset"].includes(scene)) {
      return sendError(res, 400, ApiErrorCode.INVALID_SCENE, "无效的操作类型");
    }

    const rl = forgotRateLimiter.check(ip);
    if (rl.blocked) {
      return sendError(res, 429, ApiErrorCode.RATE_LIMITED, "发送过于频繁，请稍后重试", { retry_after_seconds: rl.retryAfterSec });
    }

    if (!isSmsConfigured()) {
      return sendError(res, 503, ApiErrorCode.SMS_NOT_CONFIGURED, "短信服务暂未配置，请稍后重试");
    }

    const user = await usersRepo.findByKey(userKey);
    if (!user) return sendError(res, 404, ApiErrorCode.USER_NOT_FOUND, "用户不存在");

    const targetPhone = (scene === "unbind" || scene === "reset") ? (user.phone || "") : phone;

    if (!targetPhone || !PHONE_REGEX.test(targetPhone)) {
      if (scene === "unbind" || scene === "reset") {
        return sendError(res, 400, ApiErrorCode.PHONE_NOT_BOUND, "尚未绑定手机号");
      }
      return sendError(res, 400, ApiErrorCode.INVALID_PHONE, "请输入有效的手机号");
    }

    const phoneRl = phoneSmsRateLimiter.check(targetPhone);
    if (phoneRl.blocked) {
      return sendError(res, 429, ApiErrorCode.RATE_LIMITED, "验证码发送过于频繁，请稍后重试", { retry_after_seconds: phoneRl.retryAfterSec });
    }

    if (scene === "bind" && user.phone) {
      return sendError(res, 409, ApiErrorCode.PHONE_ALREADY_BOUND, "已绑定手机号，请先解绑或换绑");
    }
    if ((scene === "rebind" || scene === "unbind") && !user.phone) {
      return sendError(res, 400, ApiErrorCode.PHONE_NOT_BOUND, "尚未绑定手机号");
    }
    if (scene === "reset" && (!user.phone || !user.phone_verified)) {
      return sendError(res, 400, ApiErrorCode.PHONE_NOT_BOUND, "未绑定手机号，请使用邮箱验证");
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const codeType = `phone_${scene}`;

    const code = String(crypto.randomInt(100000, 1000000));
    const resetId = await authRepo.createResetCode({
      userKey,
      phone: targetPhone,
      codeHash: hashVerificationCode(code),
      codeType,
      expiresAt,
      ip,
    });

    let smsSent = false;
    try {
      const tplCode = scene === "reset" ? getSmsResetTemplateCode() : undefined;
      await sendSmsVerificationCode(targetPhone, tplCode, code);
      smsSent = true;
      await authRepo.markSmsSent(resetId, true);
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error(`[send-phone-code] ✗ 短信发送失败: ${maskPhone(targetPhone)} - ${errorMsg}`);
      await authRepo.markSmsSent(resetId, false, errorMsg);
    }

    phoneSmsRateLimiter.record(targetPhone);
    forgotRateLimiter.record(ip);

    if (!smsSent) {
      return sendError(res, 500, ApiErrorCode.SMS_SEND_FAILED, "短信发送失败，请稍后重试");
    }

    res.json({ success: true, sms_sent: true });
  }));

  // ── 绑定手机 ──────────────────────────────────────────
  router.post("/api/auth/bind-phone", requireAuth, asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const rl = forgotRateLimiter.check(ip);
    if (rl.blocked) {
      return sendError(res, 429, ApiErrorCode.RATE_LIMITED, "操作过于频繁，请稍后重试", { retry_after_seconds: rl.retryAfterSec });
    }

    const userKey = req.userKey || "";
    const phone = String(req.body.phone || "").trim();
    const code = String(req.body.code || "").trim();

    if (!userKey) return sendError(res, 400, ApiErrorCode.USER_REQUIRED, "请先登录");
    if (!phone || !PHONE_REGEX.test(phone)) return sendError(res, 400, ApiErrorCode.INVALID_PHONE, "请输入有效的手机号");
    if (!code) return sendError(res, 400, ApiErrorCode.VERIFY_CODE_REQUIRED, "请输入验证码");

    const user = await usersRepo.findByKey(userKey);
    if (!user) return sendError(res, 404, ApiErrorCode.USER_NOT_FOUND, "用户不存在");
    if (user.phone) return sendError(res, 409, ApiErrorCode.PHONE_ALREADY_BOUND, "已绑定手机号，请先解绑或换绑");

    const codeRecord = await authRepo.findLatestActiveCode(userKey, "phone_bind", phone);

    if (!codeRecord) return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
    if (codeRecord.attempts >= 5) return sendError(res, 429, ApiErrorCode.TOO_MANY_ATTEMPTS, "尝试次数过多，请重新获取验证码");
    if (codeRecord.code !== hashVerificationCode(code)) {
      await authRepo.incrementCodeAttempts(codeRecord.id);
      return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
    }

    // H-3 安全加固：原子操作绑定手机号（仅未绑定时生效）
    const bound = await usersRepo.bindPhoneIfUnbound(userKey, phone);
    if (!bound) {
      const existingByPhone = await usersRepo.findByPhone(phone);
      if (existingByPhone) return sendError(res, 409, ApiErrorCode.PHONE_ALREADY_BOUND, "该手机号已被其他用户绑定");
      return sendError(res, 409, ApiErrorCode.PHONE_ALREADY_BOUND, "已绑定手机号，请先解绑或换绑");
    }

    await authRepo.markCodeUsed(codeRecord.id);
    res.json({ success: true, phone: maskPhone(phone) });
  }));

  // ── 换绑手机 ──────────────────────────────────────────
  router.post("/api/auth/rebind-phone", requireAuth, asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const rl = forgotRateLimiter.check(ip);
    if (rl.blocked) {
      return sendError(res, 429, ApiErrorCode.RATE_LIMITED, "操作过于频繁，请稍后重试", { retry_after_seconds: rl.retryAfterSec });
    }

    const userKey = req.userKey || "";
    const newPhone = String(req.body.new_phone || "").trim();
    const code = String(req.body.code || "").trim();

    if (!userKey) return sendError(res, 400, ApiErrorCode.USER_REQUIRED, "请先登录");
    if (!newPhone || !PHONE_REGEX.test(newPhone)) return sendError(res, 400, ApiErrorCode.INVALID_PHONE, "请输入有效的手机号");
    if (!code) return sendError(res, 400, ApiErrorCode.VERIFY_CODE_REQUIRED, "请输入验证码");

    const user = await usersRepo.findByKey(userKey);
    if (!user) return sendError(res, 404, ApiErrorCode.USER_NOT_FOUND, "用户不存在");
    if (!user.phone) return sendError(res, 400, ApiErrorCode.PHONE_NOT_BOUND, "尚未绑定手机号");

    const codeRecord = await authRepo.findLatestActiveCode(userKey, "phone_rebind", newPhone);

    if (!codeRecord) return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
    if (codeRecord.attempts >= 5) return sendError(res, 429, ApiErrorCode.TOO_MANY_ATTEMPTS, "尝试次数过多，请重新获取验证码");
    if (codeRecord.code !== hashVerificationCode(code)) {
      await authRepo.incrementCodeAttempts(codeRecord.id);
      return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
    }

    const existingByPhone = await usersRepo.findByPhone(newPhone);
    if (existingByPhone && existingByPhone.user_key !== userKey) {
      return sendError(res, 409, ApiErrorCode.PHONE_ALREADY_BOUND, "该手机号已被其他用户绑定");
    }

    await usersRepo.bindPhone(userKey, newPhone);
    await authRepo.markCodeUsed(codeRecord.id);
    res.json({ success: true, phone: maskPhone(newPhone) });
  }));

  // ── 解绑手机 ──────────────────────────────────────────
  router.post("/api/auth/unbind-phone", requireAuth, asyncHandler(async (req, res) => {
    const ip = extractClientIp(req);
    const rl = forgotRateLimiter.check(ip);
    if (rl.blocked) {
      return sendError(res, 429, ApiErrorCode.RATE_LIMITED, "操作过于频繁，请稍后重试", { retry_after_seconds: rl.retryAfterSec });
    }

    const userKey = req.userKey || "";
    const code = String(req.body.code || "").trim();

    if (!userKey) return sendError(res, 400, ApiErrorCode.USER_REQUIRED, "请先登录");
    if (!code) return sendError(res, 400, ApiErrorCode.VERIFY_CODE_REQUIRED, "请输入验证码");

    const user = await usersRepo.findByKey(userKey);
    if (!user) return sendError(res, 404, ApiErrorCode.USER_NOT_FOUND, "用户不存在");
    if (!user.phone) return sendError(res, 400, ApiErrorCode.PHONE_NOT_BOUND, "尚未绑定手机号");

    const codeRecord = await authRepo.findLatestActiveCode(userKey, "phone_unbind", user.phone);

    if (!codeRecord) return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
    if (codeRecord.attempts >= 5) return sendError(res, 429, ApiErrorCode.TOO_MANY_ATTEMPTS, "尝试次数过多，请重新获取验证码");
    if (codeRecord.code !== hashVerificationCode(code)) {
      await authRepo.incrementCodeAttempts(codeRecord.id);
      return sendError(res, 400, ApiErrorCode.INVALID_CODE, "验证码无效，请重新获取");
    }

    await usersRepo.unbindPhone(userKey);
    await authRepo.markCodeUsed(codeRecord.id);
    res.json({ success: true });
  }));

  return router;
}
