/** POST /api/auth/bind-email — 绑定邮箱（需认证） */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { EC_NOT_FOUND, EC_EMAIL_ALREADY_BOUND, EC_EMAIL_ISSUE, EC_INVALID_CODE, EC_TOO_MANY_ATTEMPTS, EC_CONTACT_TAKEN_BY_OTHER } from "@/shared/constants/api";
import { hashVerificationCode } from "@/lib/services/auth";

const bindEmailSchema = z.object({
  email: z
    .string({ error: "请输入有效的邮箱地址" })
    .trim()
    .toLowerCase()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "请输入有效的邮箱地址"),
  code: z.string({ error: "请输入验证码" }).min(1, "请输入验证码"),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const { email, code } = await parseJson(req, bindEmailSchema, { email: EC_EMAIL_ISSUE, code: EC_INVALID_CODE });

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findById(auth.userId!);
  if (!user) routeError(404, EC_NOT_FOUND, "用户不存在");
  if (user.email) routeError(409, EC_EMAIL_ALREADY_BOUND, "已绑定邮箱，请先解绑");

  const targetEmail = email;
  const record = await ctx.user.authRepo.findLatestActiveCode(auth.userId!, "email_bind", targetEmail);
  if (!record) routeError(400, EC_INVALID_CODE, "验证码无效，请重新获取");
  if (record.attempts >= 5) routeError(429, EC_TOO_MANY_ATTEMPTS, "尝试次数过多");
  if (record.code !== hashVerificationCode(code)) {
    await ctx.user.authRepo.incrementCodeAttempts(record.id);
    routeError(400, EC_INVALID_CODE, "验证码无效，请重新获取");
  }

  // 检查邮箱是否已被其他用户绑定（身份比对按内部 id；无法确认归属时 fail-closed 拒绝）
  const existingByEmail = await ctx.user.usersRepo.findByEmail(targetEmail);
  if (existingByEmail && (auth.userId == null || existingByEmail.id !== auth.userId)) {
    routeError(409, EC_CONTACT_TAKEN_BY_OTHER, "该邮箱已被其他用户绑定");
  }

  await ctx.user.usersRepo.bindEmailById(auth.userId!, targetEmail);
  await ctx.user.authRepo.markCodeUsed(record.id);
  return NextResponse.json({ success: true, email: targetEmail });
});
