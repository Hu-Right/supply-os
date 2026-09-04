/**
 * POST /api/auth/send-register-code — 发送注册邮箱验证码
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { hashVerificationCode } from "@/lib/services/auth";
import { sendRegistrationVerifyEmail, isEmailConfigured } from "@/lib/services/email";
import { VERIFICATION_CODE_EXPIRES_MS, ONE_MINUTE_MS } from "@/shared/constants/time";

const registerEmailSchema = z.object({
  email: z
    .string({ error: "请输入有效的邮箱地址" })
    .trim()
    .toLowerCase()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "请输入有效的邮箱地址"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const { email: addr } = await parseJson(req, registerEmailSchema, { email: 40010 });
  if (!isEmailConfigured()) {
    routeError(503, 40060, "邮件服务暂未配置，请稍后重试");
  }

  // 限流：未认证端点，防邮件轰炸（IP + 目标邮箱双维度，1 分钟 3 次）
  const rl = checkRateLimit(req, { windowMs: ONE_MINUTE_MS, maxAttempts: 3 },
    (r) => `regcode:${extractClientIp(r)}:${addr}`);
  if (rl) return rl;

  const ctx = getContext();
  // 检查 user_key 列（登录凭据）是否已占用（历史用户 user_key = 小写邮箱）
  const existing = await ctx.user.usersRepo.findByKey(addr);
  if (existing) {
    return NextResponse.json({ success: true, email_sent: true, message: "验证码已发送到您的邮箱，请查收", support_hint: null });
  }

  await ctx.user.authRepo.invalidateUnusedCodes(addr, "registration");
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRES_MS);
  const resetId = await ctx.user.authRepo.createResetCode({ userKey: addr, codeHash: hashVerificationCode(code), codeType: "registration", expiresAt, ip: extractClientIp(req) });

  let emailSent = false;
  try {
    await sendRegistrationVerifyEmail(addr, code);
    await ctx.user.authRepo.markEmailSent(resetId, true);
    emailSent = true;
  } catch (err) {
    await ctx.user.authRepo.markEmailSent(resetId, false, (err as Error).message);
  }
  return NextResponse.json({ success: true, email_sent: emailSent, support_hint: emailSent ? null : "邮件发送失败，请检查邮箱地址或稍后重试" });
});
