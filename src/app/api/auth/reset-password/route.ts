/**
 * POST /api/auth/reset-password — 找回密码：重置密码（手机优先，邮箱备用）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { hashPassword, hashVerificationCode, buildUserResponse, issueTokenPair } from "@/lib/services/auth";
import { validatePassword } from "@/lib/utils/passwordPolicy";
import { setRefreshCookieOnResponse } from "@/lib/utils/auth-cookies-next";

const PHONE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const resetSchema = z.object({
  identifier: z.string({ error: "请填写完整信息" }).trim().min(1, "请填写完整信息"),
  code: z.string({ error: "请填写完整信息" }).trim().min(1, "请填写完整信息"),
  new_password: z.string({ error: "请填写完整信息" }).min(1, "请填写完整信息"),
  channel: z.enum(["sms", "email"]).optional(),
});

/** 智能识别：手机号 → sms，邮箱 → email，默认 sms */
function detectChannel(identifier: string): "sms" | "email" {
  if (PHONE_RE.test(identifier)) return "sms";
  if (EMAIL_RE.test(identifier)) return "email";
  return "sms";
}

export const POST = withRoute(async (req: NextRequest) => {
  const body = await parseJson(req, resetSchema, {
    identifier: 40002, code: 40002, new_password: 40002,
  });
  const identifier = body.identifier;
  const verifyCode = body.code;
  const newPassword = body.new_password;
  // 前端可显式指定 channel，未指定时自动识别
  const channel: "sms" | "email" = body.channel || detectChannel(identifier);

  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.valid) routeError(400, 40006, pwCheck.message);

  const ctx = getContext();
  let resolvedUserKey = identifier;

  // 手机渠道：通过 identifier 反查 user_key
  if (channel === "sms" && /^1[3-9]\d{9}$/.test(identifier)) {
    const byPhone = await ctx.user.usersRepo.findByPhone(identifier);
    if (!byPhone || !byPhone.user_key) {
      routeError(400, 40007, "验证码无效，请重新获取");
    }
    resolvedUserKey = byPhone.user_key;
  }

  // 查找验证码记录
  const codeType = channel === "sms" ? "phone_reset" : "email_reset";
  const record = await ctx.user.authRepo.findLatestActiveCode(resolvedUserKey, codeType);
  if (!record) routeError(400, 40007, "验证码无效，请重新获取");
  if (record.attempts >= 5) routeError(429, 40029, "尝试次数过多，请重新获取验证码");
  if (record.code !== hashVerificationCode(verifyCode)) {
    await ctx.user.authRepo.incrementCodeAttempts(record.id);
    routeError(400, 40007, "验证码无效，请重新获取");
  }

  // 重置密码
  const newHash = await hashPassword(newPassword);
  await ctx.user.usersRepo.updatePassword(resolvedUserKey, newHash, "bcrypt");
  await ctx.user.authRepo.deleteRefreshTokensByUser(resolvedUserKey); // 撤销所有现有 Token
  if (channel !== "sms") await ctx.user.usersRepo.markEmailVerified(resolvedUserKey);
  await ctx.user.authRepo.markCodeUsed(record.id);

  // 自动登录
  const user = await ctx.user.usersRepo.findAuthByKey(resolvedUserKey);
  if (!user) routeError(500, 50000, "重置成功，但获取用户信息失败，请重新登录");
  const payload = await buildUserResponse(user, ctx.user.membershipRepo, ctx.supplier.registrationRepo);
  let tokens: { token: string; refresh_token: string } | null = null;
  try { tokens = await issueTokenPair(ctx.user.authRepo, user.user_key, user.email || ""); } catch { /* */ }

  const response = NextResponse.json({ success: true, user: payload, token: tokens?.token });
  if (tokens) setRefreshCookieOnResponse(response, tokens.refresh_token);
  return response;
});
