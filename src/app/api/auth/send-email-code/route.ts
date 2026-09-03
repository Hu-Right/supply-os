/**
 * POST /api/auth/send-email-code — 发送邮箱验证码（需认证）
 *
 * 用于邮箱绑定/解绑流程：用户输入邮箱 → 发送 6 位验证码 → 10 分钟有效
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
import { sendEmailBindingCode, isEmailConfigured } from "@/lib/services/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sendEmailSchema = z.object({
  email: z.string().optional(),
  scene: z.enum(["bind", "unbind"], { error: "无效的操作类型" }).default("bind"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const { email, scene } = await parseJson(req, sendEmailSchema, { scene: 40020 });
  if (!isEmailConfigured()) {
    routeError(503, 40060, "邮件服务暂未配置，请稍后重试");
  }

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findByKey(auth.userKey);
  if (!user) routeError(404, 40044, "用户不存在");

  const targetEmail = scene === "unbind" ? (user.email || "") : String(email || "").trim().toLowerCase();
  if (!targetEmail || !EMAIL_RE.test(targetEmail)) {
    routeError(400, 40010, "请输入有效的邮箱地址");
  }
  if (scene === "bind" && user.email) {
    routeError(409, 40031, "已绑定邮箱，请先解绑");
  }
  if (scene === "unbind" && !user.email) {
    routeError(400, 40030, "尚未绑定邮箱");
  }

  // 检查邮箱是否已被其他用户绑定
  if (scene === "bind") {
    const existingByEmail = await ctx.user.usersRepo.findByEmail(targetEmail);
    if (existingByEmail && existingByEmail.user_key !== auth.userKey) {
      routeError(409, 40032, "该邮箱已被其他用户绑定");
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
    routeError(500, 40062, "邮件发送失败，请稍后重试");
  }
  return NextResponse.json({ success: true, email_sent: true });
});
