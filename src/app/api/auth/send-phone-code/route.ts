/**
 * POST /api/auth/send-phone-code — 发送手机验证码（需认证）
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_REQUEST, EC_SMS_NOT_CONFIGURED, EC_NOT_FOUND, EC_PHONE_ISSUE, EC_PHONE_NOT_BOUND, EC_PHONE_ALREADY_BOUND, EC_SMS_SEND_FAILED } from "@/shared/constants/api";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { hashVerificationCode } from "@/lib/services/auth";
import { sendSmsVerificationCode, isSmsConfigured, getSmsResetTemplateCode } from "@/lib/services/sms";
import { VERIFICATION_CODE_EXPIRES_MS, ONE_MINUTE_MS } from "@/shared/constants/time";

const PHONE_RE = /^1[3-9]\d{9}$/;

const sendPhoneSchema = z.object({
  phone: z.string().optional(),
  scene: z.enum(["bind", "rebind", "unbind", "reset"], { error: "无效的操作类型" }).default("bind"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const { phone, scene } = await parseJson(req, sendPhoneSchema, { scene: EC_INVALID_REQUEST });
  if (!isSmsConfigured()) {
    routeError(503, EC_SMS_NOT_CONFIGURED, "短信服务暂未配置，请稍后重试");
  }

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findById(auth.userId!);
  if (!user) routeError(404, EC_NOT_FOUND, "用户不存在");

  const targetPhone = (scene === "unbind" || scene === "reset") ? (user.phone || "") : String(phone || "").trim();
  if (!targetPhone || !PHONE_RE.test(targetPhone)) {
    routeError(400, scene === "unbind" || scene === "reset" ? EC_PHONE_NOT_BOUND : EC_PHONE_ISSUE,
      scene === "unbind" || scene === "reset" ? "尚未绑定手机号" : "请输入有效的手机号");
  }
  if (scene === "bind" && user.phone) routeError(409, EC_PHONE_ALREADY_BOUND, "已绑定手机号，请先解绑或换绑");
  if ((scene === "rebind" || scene === "unbind") && !user.phone) routeError(400, EC_PHONE_NOT_BOUND, "尚未绑定手机号");

  const codeType = `phone_${scene}`;
  // 限流：短信按 user + 手机号双维度，1 分钟 1 次（防短信轰炸）
  const rl = checkRateLimit(req, { windowMs: ONE_MINUTE_MS, maxAttempts: 1 },
    () => `smscode:${auth.userId}:${targetPhone}`);
  if (rl) return rl;

  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRES_MS);
  const resetId = await ctx.user.authRepo.createResetCode({ userId: auth.userId!, phone: targetPhone, codeHash: hashVerificationCode(code), codeType, expiresAt, ip: extractClientIp(req) });

  let smsSent = false;
  try {
    const tplCode = scene === "reset" ? getSmsResetTemplateCode() : undefined;
    await sendSmsVerificationCode(targetPhone, tplCode, code);
    smsSent = true;
    await ctx.user.authRepo.markSmsSent(resetId, true);
  } catch (err) {
    await ctx.user.authRepo.markSmsSent(resetId, false, (err as Error).message);
  }
  if (!smsSent) routeError(500, EC_SMS_SEND_FAILED, "短信发送失败，请稍后重试");
  return NextResponse.json({ success: true, sms_sent: true });
});
