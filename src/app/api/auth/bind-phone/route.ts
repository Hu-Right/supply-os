/** POST /api/auth/bind-phone — 绑定手机号（需认证） */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { hashVerificationCode } from "@/lib/services/auth";
import { maskPhone } from "@/lib/utils/mask";

const bindPhoneSchema = z.object({
  phone: z.string({ error: "请输入有效的手机号" }).regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  code: z.string({ error: "请输入验证码" }).min(1, "请输入验证码"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const { phone, code } = await parseJson(req, bindPhoneSchema, { phone: 40011, code: 40005 });

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findById(auth.userId!);
  if (!user) routeError(404, 40044, "用户不存在");
  if (user.phone) routeError(409, 40031, "已绑定手机号，请先解绑或换绑");

  const record = await ctx.user.authRepo.findLatestActiveCode(auth.userId!, "phone_bind", phone);
  if (!record) routeError(400, 40007, "验证码无效，请重新获取");
  if (record.attempts >= 5) routeError(429, 40029, "尝试次数过多");
  if (record.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(record.id);
    routeError(400, 40007, "验证码无效，请重新获取");
  }

  const bound = await ctx.user.usersRepo.bindPhoneIfUnboundById(auth.userId!, phone);
  if (!bound) {
    const existingByPhone = await ctx.user.usersRepo.findByPhone(phone);
    if (existingByPhone) routeError(409, 40032, "该手机号已被其他用户绑定");
    routeError(409, 40031, "已绑定手机号");
  }
  await ctx.user.authRepo.markCodeUsed(record.id);
  return NextResponse.json({ success: true, phone: maskPhone(phone) });
});
