/**
 * PUT /api/auth/profile — 修改昵称（需认证）
 *
 * 隐私整改：对外展示名（nickname）用户自定义入口。
 * 真实姓名 display_name 不接受本路由修改（涉及实名一致性，走客服通道）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { buildUserResponse } from "@/lib/services/auth";

/** 昵称清洗与校验：1-40 字符，去首尾空白，剥离富文本特殊字符（防 XSS 存量，SQL 已参数化） */
function sanitizeNickname(input: unknown): { ok: true; value: string } | { ok: false } {
  const raw = String(input ?? "").trim();
  const cleaned = raw.replace(/[<>"'&\\]/g, "").trim();
  if (!cleaned || cleaned.length > 40) return { ok: false };
  return { ok: true, value: cleaned };
}

export const PUT = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  if (!auth.authViaJwt) {
    routeError(403, 40003, "请通过有效凭证访问");
  }

  const body = (await req.json().catch(() => ({}))) as { nickname?: unknown };
  const check = sanitizeNickname(body.nickname);
  if (!check.ok) {
    routeError(400, 40051, "昵称需为 1-40 个字符，且不含特殊符号");
  }

  const ctx = getContext();
  await ctx.user.usersRepo.updateProfileById(auth.userId, check.value);

  const user = await ctx.user.usersRepo.findProfileById(auth.userId);
  if (!user) routeError(404, 40044, "用户不存在");

  const payload = await buildUserResponse(user, ctx.user.membershipRepo, ctx.supplier.registrationRepo);
  return NextResponse.json({ success: true, user: payload });
});
