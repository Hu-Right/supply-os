/**
 * POST /api/auth/send-phone-code — 发送手机验证码（需认证）
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { hashVerificationCode } from "@/lib/services/auth";
import { sendSmsVerificationCode, isSmsConfigured, getSmsResetTemplateCode } from "@/lib/services/sms";

const PHONE_RE = /^1[3-9]\d{9}$/;

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { phone, scene = "bind" } = await req.json();
  if (!["bind", "rebind", "unbind", "reset"].includes(scene)) {
    return NextResponse.json({ code: 40020, message: "无效的操作类型" }, { status: 400 });
  }
  if (!isSmsConfigured()) {
    return NextResponse.json({ code: 40061, message: "短信服务暂未配置，请稍后重试" }, { status: 503 });
  }

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findByKey(auth.userKey);
  if (!user) return NextResponse.json({ code: 40044, message: "用户不存在" }, { status: 404 });

  const targetPhone = (scene === "unbind" || scene === "reset") ? (user.phone || "") : String(phone || "").trim();
  if (!targetPhone || !PHONE_RE.test(targetPhone)) {
    return NextResponse.json({ code: scene === "unbind" || scene === "reset" ? 40030 : 40011, message: scene === "unbind" || scene === "reset" ? "尚未绑定手机号" : "请输入有效的手机号" }, { status: 400 });
  }
  if (scene === "bind" && user.phone) return NextResponse.json({ code: 40031, message: "已绑定手机号，请先解绑或换绑" }, { status: 409 });
  if ((scene === "rebind" || scene === "unbind") && !user.phone) return NextResponse.json({ code: 40030, message: "尚未绑定手机号" }, { status: 400 });

  const codeType = `phone_${scene}`;
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const resetId = await ctx.user.authRepo.createResetCode({ userKey: auth.userKey, phone: targetPhone, codeHash: hashVerificationCode(code), codeType, expiresAt, ip: "127.0.0.1" });

  let smsSent = false;
  try {
    const tplCode = scene === "reset" ? getSmsResetTemplateCode() : undefined;
    await sendSmsVerificationCode(targetPhone, tplCode, code);
    smsSent = true;
    await ctx.user.authRepo.markSmsSent(resetId, true);
  } catch (err) {
    await ctx.user.authRepo.markSmsSent(resetId, false, (err as Error).message);
  }
  if (!smsSent) return NextResponse.json({ code: 40062, message: "短信发送失败，请稍后重试" }, { status: 500 });
  return NextResponse.json({ success: true, sms_sent: true });
}
