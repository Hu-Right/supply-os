/**
 * POST /api/auth/send-register-sms-code — 发送注册短信验证码（无需认证）
 *
 * 用于手机号注册流程：用户输入手机号 → 发送 6 位验证码 → 10 分钟有效
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { hashVerificationCode } from "@/lib/services/auth";
import { sendSmsVerificationCode, isSmsConfigured } from "@/lib/services/sms";

const registerSmsSchema = z.object({
  phone: z.string({ error: "请输入有效的手机号" }).trim().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const { phone: targetPhone } = await parseJson(req, registerSmsSchema, { phone: 40011 });

  if (!isSmsConfigured()) {
    routeError(503, 40061, "短信服务暂未配置，请稍后重试");
  }

  const ctx = getContext();

  // 检查手机号是否已注册
  const existing = await ctx.user.usersRepo.findByPhone(targetPhone);
  if (existing) {
    routeError(400, 40008, "该手机号已注册，请直接登录");
  }

  // 限流：同一手机号 60 秒内只能发一次
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 1 },
    () => `smscode:register:${targetPhone}`);
  if (rl) return rl;

  // 生成 6 位验证码
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 分钟有效

  // 存入验证码表（user_key 用手机号，code_type 区分注册场景）
  const resetId = await ctx.user.authRepo.createResetCode({
    userKey: targetPhone,
    phone: targetPhone,
    codeHash: hashVerificationCode(code),
    codeType: "registration",
    expiresAt,
    ip: extractClientIp(req),
  });

  // 发送短信
  let smsSent = false;
  try {
    await sendSmsVerificationCode(targetPhone, undefined, code);
    smsSent = true;
    await ctx.user.authRepo.markSmsSent(resetId, true);
  } catch (err) {
    await ctx.user.authRepo.markSmsSent(resetId, false, (err as Error).message);
  }

  if (!smsSent) {
    routeError(500, 40062, "短信发送失败，请稍后重试");
  }

  return NextResponse.json({ success: true, sms_sent: true });
});
