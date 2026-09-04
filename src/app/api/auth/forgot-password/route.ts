/**
 * POST /api/auth/forgot-password — 找回密码：发送验证码（手机优先，邮箱备用）
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { hashVerificationCode } from "@/lib/services/auth";
import { sendPasswordResetEmail, isEmailConfigured } from "@/lib/services/email";
import { sendSmsVerificationCode, isSmsConfigured, getSmsResetTemplateCode } from "@/lib/services/sms";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { PASSWORD_RESET_EXPIRES_MS, CACHE_TTL_MEDIUM_MS } from "@/shared/constants/time";

const PHONE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const forgotSchema = z.object({
  identifier: z.string().optional(),
  channel: z.enum(["sms", "email"], { error: "无效的操作类型" }).optional(),
});

/** 智能识别输入类型：手机号 → sms，邮箱 → email */
function detectChannel(identifier: string): "sms" | "email" {
  if (PHONE_RE.test(identifier)) return "sms";
  if (EMAIL_RE.test(identifier)) return "email";
  return "sms"; // 默认短信渠道
}

export const POST = withRoute(async (req: NextRequest) => {
  const body = await parseJson(req, forgotSchema, { channel: 40020 });
  const identifier = String(body.identifier || "").trim();
  // 前端可显式指定 channel，未指定时自动识别
  const channel: "sms" | "email" = body.channel || detectChannel(identifier);
  const ctx = getContext();

  // 限流（审查 F12）：IP + 目标账号双维度，防短信/邮件轰炸
  const rl = checkRateLimit(req, { windowMs: CACHE_TTL_MEDIUM_MS, maxAttempts: 3 },
    (r) => `forgot:${extractClientIp(r)}:${identifier.toLowerCase()}`);
  if (rl) return rl;

  // ── 短信渠道（默认优先） ──
  if (channel === "sms") {
    // 邮箱格式误入短信渠道：引导使用邮箱验证
    if (EMAIL_RE.test(identifier)) {
      return NextResponse.json({ success: true, message: "验证码发送请求已提交", sms_sent: false, support_hint: "该格式为邮箱，请使用邮箱验证方式" });
    }
    if (!PHONE_RE.test(identifier)) {
      routeError(400, 40011, "请输入有效的手机号");
    }
    const user = await ctx.user.usersRepo.findByIdentifier(identifier);
    if (!user || !user.phone || !user.phone_verified) {
      return NextResponse.json({ success: true, message: "验证码发送请求已提交", sms_sent: false, support_hint: null });
    }
    if (!isSmsConfigured()) {
      routeError(503, 40061, "短信服务暂未配置，请使用邮箱验证");
    }

    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS);
    const code = String(crypto.randomInt(100000, 1000000));
    // 发新码前失效旧码，旧验证码不得继续可用（与邮箱渠道对齐）
    await ctx.user.authRepo.invalidateUnusedCodes(user.id, "phone_reset");
    const resetId = await ctx.user.authRepo.createResetCode({
      userId: user.id, phone: user.phone, codeHash: hashVerificationCode(code), codeType: "phone_reset", expiresAt, ip: extractClientIp(req),
    });

    let smsSent = false;
    try {
      await sendSmsVerificationCode(user.phone, getSmsResetTemplateCode(), code);
      smsSent = true;
      await ctx.user.authRepo.markSmsSent(resetId, true);
    } catch (err) {
      await ctx.user.authRepo.markSmsSent(resetId, false, (err as Error).message);
    }
    return NextResponse.json({ success: true, message: "验证码已发送到您的手机", sms_sent: smsSent, support_hint: smsSent ? null : "短信发送失败，请使用邮箱验证或联系客服" });
  }

  // ── 邮箱渠道（备用） ──
  if (!identifier || !EMAIL_RE.test(identifier)) {
    routeError(400, 40010, "请输入有效的邮箱地址");
  }
  if (!isEmailConfigured()) {
    routeError(503, 40060, "邮件服务暂未配置，请联系客服重置密码");
  }

  const user = await ctx.user.usersRepo.findByIdentifier(identifier);
  let emailSent = true;
  if (user) {
    await ctx.user.authRepo.invalidateUnusedCodes(user.id, "email_reset");
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS);
    const resetId = await ctx.user.authRepo.createResetCode({
      userId: user.id, codeHash: hashVerificationCode(code), codeType: "email_reset", expiresAt, ip: extractClientIp(req),
    });
    try {
      await sendPasswordResetEmail(identifier, code);
      await ctx.user.authRepo.markEmailSent(resetId, true);
    } catch {
      await ctx.user.authRepo.markEmailSent(resetId, false, "发送失败");
      emailSent = false;
    }
  }
  return NextResponse.json({ success: true, message: "验证码已发送到您的邮箱", email_sent: emailSent, support_hint: emailSent ? null : "邮件发送失败，请联系客服协助重置密码" });
});
