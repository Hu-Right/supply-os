/**
 * POST /api/auth/send-email-code — 发送邮箱验证码（需认证）
 *
 * 用于邮箱绑定/解绑流程：用户输入邮箱 → 发送 6 位验证码 → 10 分钟有效
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { hashVerificationCode } from "@/lib/services/auth";
import { sendEmailBindingCode, isEmailConfigured } from "@/lib/services/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { email, scene = "bind" } = await req.json();
  if (!["bind", "unbind"].includes(scene)) {
    return NextResponse.json({ code: 40020, message: "无效的操作类型" }, { status: 400 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ code: 40060, message: "邮件服务暂未配置，请稍后重试" }, { status: 503 });
  }

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findByKey(auth.userKey);
  if (!user) return NextResponse.json({ code: 40044, message: "用户不存在" }, { status: 404 });

  const targetEmail = scene === "unbind" ? (user.email || "") : String(email || "").trim().toLowerCase();
  if (!targetEmail || !EMAIL_RE.test(targetEmail)) {
    return NextResponse.json({ code: 40010, message: "请输入有效的邮箱地址" }, { status: 400 });
  }
  if (scene === "bind" && user.email) {
    return NextResponse.json({ code: 40031, message: "已绑定邮箱，请先解绑" }, { status: 409 });
  }
  if (scene === "unbind" && !user.email) {
    return NextResponse.json({ code: 40030, message: "尚未绑定邮箱" }, { status: 400 });
  }

  // 检查邮箱是否已被其他用户绑定
  if (scene === "bind") {
    const existingByEmail = await ctx.user.usersRepo.findByEmail(targetEmail);
    if (existingByEmail && existingByEmail.user_key !== auth.userKey) {
      return NextResponse.json({ code: 40032, message: "该邮箱已被其他用户绑定" }, { status: 409 });
    }
  }

  const codeType = `email_${scene}`;
  // 限流：邮件按 user + 邮箱双维度，1 分钟 3 次
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 3 },
    () => `emailcode:${auth.userId}:${targetEmail}`);
  if (rl) return rl;

  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const resetId = await ctx.user.authRepo.createResetCode({
    userKey: auth.userKey,
    phone: targetEmail, // 复用 phone 字段存储邮箱（code 表中 phone 列实际存储验证目标）
    codeHash: hashVerificationCode(code),
    codeType,
    expiresAt,
    ip: extractClientIp(req),
  });

  let emailSent = false;
  try {
    await sendEmailBindingCode(targetEmail, code);
    emailSent = true;
    await ctx.user.authRepo.markEmailSent(resetId, true);
  } catch (err) {
    await ctx.user.authRepo.markEmailSent(resetId, false, (err as Error).message);
  }
  if (!emailSent) {
    return NextResponse.json({ code: 40062, message: "邮件发送失败，请稍后重试" }, { status: 500 });
  }
  return NextResponse.json({ success: true, email_sent: true });
}
