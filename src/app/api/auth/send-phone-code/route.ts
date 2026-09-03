/**
 * POST /api/auth/send-phone-code — 发送手机验证码（需认证）
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { hashVerificationCode } from "@/lib/services/auth";
import { sendSmsVerificationCode, isSmsConfigured, getSmsResetTemplateCode } from "@/lib/services/sms";

const PHONE_RE = /^1[3-9]\d{9}$/;

const sendPhoneSchema = z.object({
  phone: z.string().optional(),
  scene: z.enum(["bind", "rebind", "unbind", "reset"], { error: "无效的操作类型" }).default("bind"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const { phone, scene } = await parseJson(req, sendPhoneSchema, { scene: 40020 });
  if (!isSmsConfigured()) {
    routeError(503, 40061, "短信服务暂未配置，请稍后重试");
  }

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findByKey(auth.userKey);
  if (!user) routeError(404, 40044, "用户不存在");

  const targetPhone = (scene === "unbind" || scene === "reset") ? (user.phone || "") : String(phone || "").trim();
  if (!targetPhone || !PHONE_RE.test(targetPhone)) {
    routeError(400, scene === "unbind" || scene === "reset" ? 40030 : 40011,
      scene === "unbind" || scene === "reset" ? "尚未绑定手机号" : "请输入有效的手机号");
  }
  if (scene === "bind" && user.phone) routeError(409, 40031, "已绑定手机号，请先解绑或换绑");
  if ((scene === "rebind" || scene === "unbind") && !user.phone) routeError(400, 40030, "尚未绑定手机号");

  const codeType = `phone_${scene}`;
  // 限流：短信按 user + 手机号双维度，1 分钟 1 次（防短信轰炸）
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 1 },
    () => `smscode:${auth.userId}:${targetPhone}`);
  if (rl) return rl;

  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
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
  if (!smsSent) routeError(500, 40062, "短信发送失败，请稍后重试");
  return NextResponse.json({ success: true, sms_sent: true });
});
