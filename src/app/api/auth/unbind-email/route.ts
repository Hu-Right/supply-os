/** POST /api/auth/unbind-email — 解绑邮箱（需认证） */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { EC_NOT_FOUND, EC_EMAIL_NOT_BOUND, EC_INVALID_CODE, EC_TOO_MANY_ATTEMPTS } from "@/shared/constants/api";
import { hashVerificationCode } from "@/lib/services/auth";

const unbindSchema = z.object({
  code: z.string({ error: "请输入验证码" }).min(1, "请输入验证码"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const { code } = await parseJson(req, unbindSchema, { code: EC_INVALID_CODE });

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findById(auth.userId!);
  if (!user) routeError(404, EC_NOT_FOUND, "用户不存在");
  if (!user.email) routeError(400, EC_EMAIL_NOT_BOUND, "尚未绑定邮箱");

  const record = await ctx.user.authRepo.findLatestActiveCode(auth.userId!, "email_unbind", user.email);
  if (!record) routeError(400, EC_INVALID_CODE, "验证码无效，请重新获取");
  if (record.attempts >= 5) routeError(429, EC_TOO_MANY_ATTEMPTS, "尝试次数过多");
  if (record.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(record.id);
    routeError(400, EC_INVALID_CODE, "验证码无效，请重新获取");
  }

  await ctx.user.usersRepo.unbindEmailById(auth.userId!);
  await ctx.user.authRepo.markCodeUsed(record.id);
  return NextResponse.json({ success: true });
});
