/** POST /api/auth/unbind-phone — 解绑手机号（需认证） */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { hashVerificationCode } from "@/lib/services/auth";

const unbindSchema = z.object({
  code: z.string({ error: "请输入验证码" }).min(1, "请输入验证码"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const { code } = await parseJson(req, unbindSchema, { code: 40005 });

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findByKey(auth.userKey);
  if (!user) routeError(404, 40044, "用户不存在");
  if (!user.phone) routeError(400, 40030, "尚未绑定手机号");

  const record = await ctx.user.authRepo.findLatestActiveCode(user.id, "phone_unbind", user.phone);
  if (!record) routeError(400, 40007, "验证码无效，请重新获取");
  if (record.attempts >= 5) routeError(429, 40029, "尝试次数过多");
  if (record.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(record.id);
    routeError(400, 40007, "验证码无效，请重新获取");
  }

  await ctx.user.usersRepo.unbindPhone(auth.userKey);
  await ctx.user.authRepo.markCodeUsed(record.id);
  return NextResponse.json({ success: true });
});
