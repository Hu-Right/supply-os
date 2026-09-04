/** POST /api/auth/rebind-phone — 换绑手机号（需认证） */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { hashVerificationCode } from "@/lib/services/auth";
import { maskPhone } from "@/lib/utils/mask";

const rebindPhoneSchema = z.object({
  new_phone: z.string({ error: "请输入有效的手机号" }).regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  code: z.string({ error: "请输入验证码" }).min(1, "请输入验证码"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const { new_phone, code } = await parseJson(req, rebindPhoneSchema, { new_phone: 40011, code: 40005 });

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findByKey(auth.userKey);
  if (!user) routeError(404, 40044, "用户不存在");
  if (!user.phone) routeError(400, 40030, "尚未绑定手机号");

  const record = await ctx.user.authRepo.findLatestActiveCode(user.id, "phone_rebind", new_phone);
  if (!record) routeError(400, 40007, "验证码无效，请重新获取");
  if (record.attempts >= 5) routeError(429, 40029, "尝试次数过多");
  if (record.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(record.id);
    routeError(400, 40007, "验证码无效，请重新获取");
  }

  const existingByPhone = await ctx.user.usersRepo.findByPhone(new_phone);
  if (existingByPhone && (existingByPhone.user_id == null || existingByPhone.user_id !== auth.userId)) {
    routeError(409, 40032, "该手机号已被其他用户绑定");
  }
  await ctx.user.usersRepo.bindPhone(auth.userKey, new_phone);
  await ctx.user.authRepo.markCodeUsed(record.id);
  return NextResponse.json({ success: true, phone: maskPhone(new_phone) });
});
