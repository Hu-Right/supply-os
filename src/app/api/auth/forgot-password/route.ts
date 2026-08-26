/**
 * POST /api/auth/forgot-password — 找回密码：发送验证码（邮箱/短信双渠道）
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { hashVerificationCode } from "@/lib/services/auth";
import { sendPasswordResetEmail, isEmailConfigured } from "@/lib/services/email";
import { sendSmsVerificationCode, isSmsConfigured, getSmsResetTemplateCode } from "@/lib/services/sms";
import { maskPhone } from "@/lib/utils/mask";

export async function POST(req: NextRequest) {
  const { email, channel = "email" } = await req.json();
  const identifier = String(email || "").trim().toLowerCase();
  const ctx = getContext();

  // ── 短信渠道 ──
  if (channel === "sms") {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      return NextResponse.json({ success: true, message: "验证码发送请求已提交", sms_sent: false, support_hint: null });
    }
    if (!/^1[3-9]\d{9}$/.test(identifier)) {
      return NextResponse.json({ code: 40011, message: "请输入有效的手机号" }, { status: 400 });
    }
    const byPhone = await ctx.user.usersRepo.findByPhone(identifier);
    if (!byPhone || !byPhone.user_key) {
      return NextResponse.json({ success: true, message: "验证码发送请求已提交", sms_sent: false, support_hint: null });
    }
    const user = await ctx.user.usersRepo.findByKey(byPhone.user_key);
    if (!user || !user.phone || !user.phone_verified) {
      return NextResponse.json({ success: true, message: "验证码发送请求已提交", sms_sent: false, support_hint: null });
    }
    if (!isSmsConfigured()) {
      return NextResponse.json({ code: 40061, message: "短信服务暂未配置，请使用邮箱验证" }, { status: 503 });
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const code = String(crypto.randomInt(100000, 1000000));
    const resetId = await ctx.user.authRepo.createResetCode({
      userKey: byPhone.user_key, phone: user.phone, codeHash: hashVerificationCode(code), codeType: "phone_reset", expiresAt, ip: "127.0.0.1",
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

  // ── 邮箱渠道（默认） ──
  if (!identifier || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
    return NextResponse.json({ code: 40010, message: "请输入有效的邮箱地址" }, { status: 400 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ code: 40060, message: "邮件服务暂未配置，请联系客服重置密码" }, { status: 503 });
  }

  const user = await ctx.user.usersRepo.findByKey(identifier);
  let emailSent = true;
  if (user) {
    await ctx.user.authRepo.invalidateUnusedCodes(identifier, "email_reset");
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const resetId = await ctx.user.authRepo.createResetCode({
      userKey: identifier, codeHash: hashVerificationCode(code), codeType: "email_reset", expiresAt, ip: "127.0.0.1",
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
}
