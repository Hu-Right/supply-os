/**
 * GET /api/auth/user — 获取当前用户信息（需认证）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/server/db/context";
import { requireUserKey } from "@/server/middleware/auth";
import { buildUserResponse } from "@/server/services/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;
  if (!auth.authViaJwt) {
    return NextResponse.json({ code: 40003, message: "请通过有效凭证访问" }, { status: 403 });
  }

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findProfileByKey(auth.userKey);
  if (!user) {
    return NextResponse.json({ code: 40044, message: "用户不存在" }, { status: 404 });
  }
  const payload = await buildUserResponse(user, ctx.user.membershipRepo, ctx.supplier.registrationRepo);
  return NextResponse.json({ success: true, user: payload });
}
