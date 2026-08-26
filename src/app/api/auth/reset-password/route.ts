/**
 * POST /api/auth/reset-password — 找回密码：重置密码
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { hashPassword, hashVerificationCode, buildUserResponse, issueTokenPair } from "@/lib/services/auth";
import { validatePassword } from "@/lib/utils/passwordPolicy";
import { setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

export async function POST(req: NextRequest) {
  const { email, code, new_password, channel = "email" } = await req.json();
  const identifier = String(email || "").trim().toLowerCase();
  const verifyCode = String(code || "").trim();
  const newPassword = String(new_password || "");

  if (!identifier || !verifyCode || !newPassword) {
    return NextResponse.json({ code: 40002, message: "请填写完整信息" }, { status: 400 });
  }
  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.valid) return NextResponse.json({ code: 40006, message: pwCheck.message }, { status: 400 });

  const ctx = getContext();
  let resolvedEmail = identifier;

  // 手机渠道：通过手机号反查 email
  if (channel === "sms" && /^1[3-9]\d{9}$/.test(identifier)) {
    const byPhone = await ctx.user.usersRepo.findByPhone(identifier);
    if (!byPhone || !byPhone.user_key) {
      return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
    }
    resolvedEmail = byPhone.user_key;
  }

  // 查找验证码记录
  const codeType = channel === "sms" ? "phone_reset" : "email_reset";
  const record = await ctx.user.authRepo.findLatestActiveCode(resolvedEmail, codeType);
  if (!record) return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
  if (record.attempts >= 5) return NextResponse.json({ code: 40029, message: "尝试次数过多，请重新获取验证码" }, { status: 429 });
  if (record.code !== hashVerificationCode(verifyCode)) {
    await ctx.user.authRepo.incrementCodeAttempts(record.id);
    return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
  }

  // 重置密码
  const newHash = await hashPassword(newPassword);
  await ctx.user.usersRepo.updatePassword(resolvedEmail, newHash, "bcrypt");
  await ctx.user.authRepo.deleteRefreshTokensByUser(resolvedEmail); // 撤销所有现有 Token
  if (channel !== "sms") await ctx.user.usersRepo.markEmailVerified(resolvedEmail);
  await ctx.user.authRepo.markCodeUsed(record.id);

  // 自动登录
  const user = await ctx.user.usersRepo.findAuthByKey(resolvedEmail);
  if (!user) return NextResponse.json({ code: 50000, message: "重置成功，但获取用户信息失败，请重新登录" }, { status: 500 });
  const payload = await buildUserResponse(user, ctx.user.membershipRepo, ctx.supplier.registrationRepo);
  let tokens: { token: string; refresh_token: string } | null = null;
  try { tokens = await issueTokenPair(ctx.user.authRepo, user.user_key, user.email || ""); } catch { /* */ }

  const response = NextResponse.json({ success: true, user: payload, token: tokens?.token });
  if (tokens) setRefreshCookieOnResponse(response, tokens.refresh_token);
  return response;
}
