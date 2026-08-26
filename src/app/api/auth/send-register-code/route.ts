/**
 * POST /api/auth/send-register-code — 发送注册邮箱验证码
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { hashVerificationCode } from "@/lib/services/auth";
import { sendRegistrationVerifyEmail, isEmailConfigured } from "@/lib/services/email";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  const addr = String(email || "").trim().toLowerCase();
  if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
    return NextResponse.json({ code: 40010, message: "请输入有效的邮箱地址" }, { status: 400 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ code: 40060, message: "邮件服务暂未配置，请稍后重试" }, { status: 503 });
  }

  const ctx = getContext();
  const existing = await ctx.user.usersRepo.findByKey(addr);
  if (existing) {
    return NextResponse.json({ success: true, email_sent: true, message: "验证码已发送到您的邮箱，请查收", support_hint: null });
  }

  await ctx.user.authRepo.invalidateUnusedCodes(addr, "registration");
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const resetId = await ctx.user.authRepo.createResetCode({ userKey: addr, codeHash: hashVerificationCode(code), codeType: "registration", expiresAt, ip: "127.0.0.1" });

  let emailSent = false;
  try {
    await sendRegistrationVerifyEmail(addr, code);
    await ctx.user.authRepo.markEmailSent(resetId, true);
    emailSent = true;
  } catch (err) {
    await ctx.user.authRepo.markEmailSent(resetId, false, (err as Error).message);
  }
  return NextResponse.json({ success: true, email_sent: emailSent, support_hint: emailSent ? null : "邮件发送失败，请检查邮箱地址或稍后重试" });
}
