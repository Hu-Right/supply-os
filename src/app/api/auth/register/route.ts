/**
 * POST /api/auth/register — 用户注册
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { hashPassword, hashVerificationCode, issueTokenPair } from "@/lib/services/auth";
import { validatePassword } from "@/lib/utils/passwordPolicy";
import { setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

export async function POST(req: NextRequest) {
  const { email, phone, password, verify_code, display_name, invitation_code, user_type } = await req.json();
  const userType = user_type === "personal" ? "personal" : "enterprise";
  const inviteCode = String(invitation_code || "").trim().toUpperCase();
  const pw = String(password || "");
  const code = String(verify_code || "");
  const displayName = String(display_name || "会员");
  const targetPhone = String(phone || "").trim();

  // ── 公共校验 ──
  if (!targetPhone || !/^1[3-9]\d{9}$/.test(targetPhone)) {
    return NextResponse.json({ code: 40011, message: "请输入有效的手机号" }, { status: 400 });
  }
  if (!pw) return NextResponse.json({ code: 40001, message: "密码不能为空" }, { status: 400 });
  const pwCheck = validatePassword(pw);
  if (!pwCheck.valid) return NextResponse.json({ code: 40006, message: pwCheck.message }, { status: 400 });
  if (!inviteCode) return NextResponse.json({ code: 40030, message: "请输入邀请码" }, { status: 400 });
  if (!code) return NextResponse.json({ code: 40005, message: "请输入短信验证码" }, { status: 400 });

  const ctx = getContext();

  // ── 邀请码有效性校验 ──
  const inviteValidation = await ctx.user.invitationRepo.validateCode(inviteCode);
  if (!inviteValidation.valid) {
    return NextResponse.json({ code: 40031, message: inviteValidation.reason || "邀请码无效" }, { status: 400 });
  }
  const referralEmployeeId = inviteValidation.employee_id!;

  // ── 短信验证码校验 ──
  const codeRecord = await ctx.user.authRepo.findLatestActiveCode(targetPhone, "registration", targetPhone);
  if (!codeRecord) return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
  if (codeRecord.attempts >= 5) return NextResponse.json({ code: 40029, message: "尝试次数过多，请重新获取验证码" }, { status: 429 });
  if (codeRecord.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(codeRecord.id);
    return NextResponse.json({ code: 40007, message: "验证码无效，请重新获取" }, { status: 400 });
  }

  const existing = await ctx.user.usersRepo.findByPhone(targetPhone);
  if (existing) return NextResponse.json({ code: 40008, message: "该手机号已注册，请直接登录" }, { status: 400 });

  const created = await ctx.user.usersRepo.create({
    user_key: targetPhone,
    email: email ? String(email).trim().toLowerCase() : null,
    display_name: displayName,
    password_hash: await hashPassword(pw),
    user_type: userType,
    phone: targetPhone,
    referral_code: inviteCode,
    referral_employee_id: referralEmployeeId,
  });
  if (!created) return NextResponse.json({ code: 40008, message: "注册失败，请稍后重试" }, { status: 400 });

  await ctx.user.authRepo.markCodeUsed(codeRecord.id);
  await ctx.user.usersRepo.markPhoneVerified(targetPhone);
  await ctx.user.invitationRepo.incrementUsedCount(inviteCode);

  let tokens: { token: string; refresh_token: string } | null = null;
  try { tokens = await issueTokenPair(ctx.user.authRepo, targetPhone, email || ""); } catch { /* JWT_SECRET 未配置 */ }

  const response = NextResponse.json({
    success: true,
    user: { user_key: targetPhone, phone: targetPhone, email: email || null, display_name: displayName, membership_tier: "free", user_type: userType },
    token: tokens?.token,
  }, { status: 201 });
  if (tokens) setRefreshCookieOnResponse(response, tokens.refresh_token);
  return response;
}
