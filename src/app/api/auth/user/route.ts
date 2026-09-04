/**
 * GET /api/auth/user — 获取当前用户信息（需认证）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { buildUserResponse } from "@/lib/services/auth";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  if (!auth.authViaJwt) {
    routeError(403, 40003, "请通过有效凭证访问");
  }

  const ctx = getContext();
  const user = await ctx.user.usersRepo.findProfileById(auth.userId!);
  if (!user) {
    routeError(404, 40044, "用户不存在");
  }
  const payload = await buildUserResponse(user, ctx.user.membershipRepo, ctx.supplier.registrationRepo);
  return NextResponse.json({ success: true, user: payload });
});
