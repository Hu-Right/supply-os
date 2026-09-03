/**
 * POST /api/auth/register — 用户注册
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { hashPassword, hashVerificationCode, issueTokenPair, generateNickname, buildUserResponse } from "@/lib/services/auth";
import { validatePassword } from "@/lib/utils/passwordPolicy";
import { setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

// 字段顺序即校验优先级（zod issues[0] 与原实现的报错顺序一致）
const registerSchema = z.object({
  display_name: z.string({ error: "请填写姓名" }).trim().min(1, "请填写姓名"),
  phone: z.string({ error: "请输入有效的手机号" }).trim().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  password: z.string({ error: "密码不能为空" }).min(1, "密码不能为空"),
  verify_code: z.string({ error: "请输入短信验证码" }).min(1, "请输入短信验证码"),
  email: z.string().trim().toLowerCase().optional(),
  invitation_code: z.string().optional(),
  user_type: z.string().optional(),
  locale: z.string().optional(),
  agreement_version: z.string().optional(),
  agreement_accepted_at: z.string().optional(),
});

export const POST = withRoute(async (req: NextRequest) => {
  const body = await parseJson(req, registerSchema, {
    display_name: 40000, phone: 40011, password: 40001, verify_code: 40005,
  });
  const { email, phone: targetPhone, password: pw, verify_code: code, display_name: displayName } = body;
  const userType = body.user_type === "personal" ? "personal" : "enterprise";

  // ★ 邀请码优先级：手动填写 > Cookie ref_code（推荐链接自动带入）
  let inviteCode = String(body.invitation_code || "").trim().toUpperCase();
  if (!inviteCode) {
    const cookieCode = req.cookies.get("ref_code")?.value;
    if (cookieCode) inviteCode = cookieCode.trim().toUpperCase();
  }

  // 密码策略（40006）
  const pwCheck = validatePassword(pw);
  if (!pwCheck.valid) routeError(400, 40006, pwCheck.message);

  const ctx = getContext();

  // ── 邀请码有效性校验（可选：有邀请码时校验，无则跳过） ──
  let referralEmployeeId: number | null = null;
  if (inviteCode) {
    const inviteValidation = await ctx.user.invitationRepo.validateCode(inviteCode);
    if (!inviteValidation.valid) {
      routeError(400, 40031, inviteValidation.reason || "邀请码无效");
    }
    referralEmployeeId = inviteValidation.employee_id!;
  }

  // ── 短信验证码校验 ──
  const codeRecord = await ctx.user.authRepo.findLatestActiveCode(targetPhone, "registration", targetPhone);
  if (!codeRecord) routeError(400, 40007, "验证码无效，请重新获取");
  if (codeRecord.attempts >= 5) routeError(429, 40029, "尝试次数过多，请重新获取验证码");
  if (codeRecord.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(codeRecord.id);
    routeError(400, 40007, "验证码无效，请重新获取");
  }

  const existing = await ctx.user.usersRepo.findByPhone(targetPhone);
  if (existing) routeError(400, 40008, "该手机号已注册，请直接登录");

  const created = await ctx.user.usersRepo.create({
    user_key: targetPhone,
    email: email ? String(email).trim().toLowerCase() : null,
    display_name: displayName,
    // 展示名与真实姓名分离：昵称按注册界面语言自动生成（用户后续可在个人中心自定义）
    nickname: generateNickname(body.locale),
    password_hash: await hashPassword(pw),
    user_type: userType,
    phone: targetPhone,
    referral_code: inviteCode,
    referral_employee_id: referralEmployeeId ?? undefined,
  });
  if (!created) routeError(400, 40008, "注册失败，请稍后重试");

  await ctx.user.authRepo.markCodeUsed(codeRecord.id);
  await ctx.user.usersRepo.markPhoneVerified(targetPhone);
  // 仅在邀请码有效时递增 KPI 归属计数
  if (referralEmployeeId) {
    await ctx.user.invitationRepo.incrementMonthlyActual(referralEmployeeId, userType);
  }

  // ── 合规审计：记录用户协议同意日志（P0） ──
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  try {
    await ctx.user.authRepo.recordConsentLog({
      userKey: targetPhone,
      consentType: "terms",
      documentVersion: body.agreement_version || "V2.0",
      action: "agree",
      timestamp: body.agreement_accepted_at || new Date().toISOString(),
      ipAddress: clientIp,
      userAgent,
      sourcePage: "register",
    });
    await ctx.user.authRepo.recordConsentLog({
      userKey: targetPhone,
      consentType: "privacy",
      documentVersion: body.agreement_version || "V2.0",
      action: "agree",
      timestamp: body.agreement_accepted_at || new Date().toISOString(),
      ipAddress: clientIp,
      userAgent,
      sourcePage: "register",
    });
  } catch (consentErr) {
    // 同意日志写入失败不阻断注册主流程，但输出告警便于排查
    console.error("[register] consent log write failed:", (consentErr as Error).message);
  }

  // 响应统一走 buildUserResponse 收口（隐私整改）：
  // 只返回昵称（不返回 display_name 真实姓名），手机号脱敏（修复原响应返回明文手机号）
  const createdUser = await ctx.user.usersRepo.findAuthByKey(targetPhone);
  if (!createdUser) {
    routeError(500, 50000, "注册失败，请稍后重试");
  }
  const payload = await buildUserResponse(createdUser, ctx.user.membershipRepo, ctx.supplier.registrationRepo);

  let tokens: { token: string; refresh_token: string } | null = null;
  try { tokens = await issueTokenPair(ctx.user.authRepo, targetPhone, email || ""); } catch { /* JWT_SECRET 未配置 */ }

  const response = NextResponse.json({
    success: true,
    user: payload,
    token: tokens?.token,
  }, { status: 201 });
  if (tokens) setRefreshCookieOnResponse(response, tokens.refresh_token);
  // 注册成功后清除推荐链接 Cookie，避免重复归属
  response.cookies.set("ref_code", "", { maxAge: 0, path: "/" });
  return response;
});
