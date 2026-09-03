/**
 * 注册编排服务（架构评估 A4：自 auth/register 路由下沉）
 *
 * @module lib/services/auth-register
 * @description 收口"手机号注册"的多仓库编排：密码策略、邀请码校验、
 *              短信验证码核销、建号（自动昵称）、KPI 归属递增、
 *              合规同意日志（失败不阻断）、载荷与 Token 签发。
 *              路由层只保留：请求解析、Cookie 邀请码回退、IP/UA 提取、Cookie 清理。
 *              业务失败以 RouteError（lib 级业务错误，含 status/code 元数据）抛出。
 */
import type { AppContext } from "../db/context";
import { RouteError } from "../middleware/route-handler";
import { hashPassword, hashVerificationCode, issueTokenPair, generateNickname, buildUserResponse } from "./auth";
import { validatePassword } from "../utils/passwordPolicy";

export interface RegisterUserParams {
  /** 已 trim 的真实姓名（必填） */
  displayName: string;
  /** 已 trim 的中国大陆手机号（注册即登录账号） */
  targetPhone: string;
  password: string;
  /** 短信验证码 */
  code: string;
  email?: string;
  /** 已大写的邀请码（Cookie 回退由路由完成） */
  inviteCode: string;
  userType: "personal" | "enterprise";
  /** 注册界面语言（决定自动昵称语种） */
  locale?: string;
  /** 合规审计字段 */
  agreementVersion?: string;
  agreementAcceptedAt?: string;
  clientIp: string;
  userAgent: string;
}

export interface RegisterUserResult {
  /** 脱敏后的用户载荷（buildUserResponse 隐私收口：仅昵称 + 脱敏手机号） */
  payload: Awaited<ReturnType<typeof buildUserResponse>>;
  /** JWT_SECRET 未配置时为 null（静默降级为无 Token 注册） */
  accessToken: string | null;
  refreshToken: string | null;
}

/** 手机号注册编排：邀请码 → 验证码 → 建号 → 归属 → 合规日志 → 载荷 + Token */
export async function registerUser(
  ctx: AppContext,
  params: RegisterUserParams,
): Promise<RegisterUserResult> {
  const { displayName, targetPhone, password: pw, code, email, inviteCode } = params;
  const userType = params.userType;

  // 密码策略（40006）
  const pwCheck = validatePassword(pw);
  if (!pwCheck.valid) throw new RouteError(400, 40006, pwCheck.message);

  // ── 邀请码有效性校验（可选：有邀请码时校验，无则跳过） ──
  let referralEmployeeId: number | null = null;
  if (inviteCode) {
    const inviteValidation = await ctx.user.invitationRepo.validateCode(inviteCode);
    if (!inviteValidation.valid) {
      throw new RouteError(400, 40031, inviteValidation.reason || "邀请码无效");
    }
    referralEmployeeId = inviteValidation.employee_id!;
  }

  // ── 短信验证码校验 ──
  const codeRecord = await ctx.user.authRepo.findLatestActiveCode(targetPhone, "registration", targetPhone);
  if (!codeRecord) throw new RouteError(400, 40007, "验证码无效，请重新获取");
  if (codeRecord.attempts >= 5) throw new RouteError(429, 40029, "尝试次数过多，请重新获取验证码");
  if (codeRecord.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(codeRecord.id);
    throw new RouteError(400, 40007, "验证码无效，请重新获取");
  }

  const existing = await ctx.user.usersRepo.findByPhone(targetPhone);
  if (existing) throw new RouteError(400, 40008, "该手机号已注册，请直接登录");

  const created = await ctx.user.usersRepo.create({
    user_key: targetPhone,
    email: email ? String(email).trim().toLowerCase() : null,
    display_name: displayName,
    // 展示名与真实姓名分离：昵称按注册界面语言自动生成（用户后续可在个人中心自定义）
    nickname: generateNickname(params.locale),
    password_hash: await hashPassword(pw),
    user_type: userType,
    phone: targetPhone,
    referral_code: inviteCode,
    referral_employee_id: referralEmployeeId ?? undefined,
  });
  if (!created) throw new RouteError(400, 40008, "注册失败，请稍后重试");

  await ctx.user.authRepo.markCodeUsed(codeRecord.id);
  await ctx.user.usersRepo.markPhoneVerified(targetPhone);
  // 仅在邀请码有效时递增 KPI 归属计数
  if (referralEmployeeId) {
    await ctx.user.invitationRepo.incrementMonthlyActual(referralEmployeeId, userType);
  }

  // ── 合规审计：记录用户协议同意日志（P0）——失败不阻断主流程 ──
  try {
    await ctx.user.authRepo.recordConsentLog({
      userKey: targetPhone,
      consentType: "terms",
      documentVersion: params.agreementVersion || "V2.0",
      action: "agree",
      timestamp: params.agreementAcceptedAt || new Date().toISOString(),
      ipAddress: params.clientIp,
      userAgent: params.userAgent,
      sourcePage: "register",
    });
    await ctx.user.authRepo.recordConsentLog({
      userKey: targetPhone,
      consentType: "privacy",
      documentVersion: params.agreementVersion || "V2.0",
      action: "agree",
      timestamp: params.agreementAcceptedAt || new Date().toISOString(),
      ipAddress: params.clientIp,
      userAgent: params.userAgent,
      sourcePage: "register",
    });
  } catch (consentErr) {
    console.error("[register] consent log write failed:", (consentErr as Error).message);
  }

  // 响应统一走 buildUserResponse 收口（隐私整改）：
  // 只返回昵称（不返回 display_name 真实姓名），手机号脱敏（修复原响应返回明文手机号）
  const createdUser = await ctx.user.usersRepo.findAuthByKey(targetPhone);
  if (!createdUser) {
    throw new RouteError(500, 50000, "注册失败，请稍后重试");
  }
  const payload = await buildUserResponse(createdUser, ctx.user.membershipRepo, ctx.supplier.registrationRepo);

  let tokens: { token: string; refresh_token: string } | null = null;
  try { tokens = await issueTokenPair(ctx.user.authRepo, targetPhone, email || ""); } catch { /* JWT_SECRET 未配置 */ }

  return {
    payload,
    accessToken: tokens?.token ?? null,
    refreshToken: tokens?.refresh_token ?? null,
  };
}
