/** 当前用户的生效套餐、订阅及额度账本。 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { resolveMembershipState } from "@/lib/services/membership-status";
import { membershipStatusViewOf } from "@/lib/services/membership/view";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const state = await resolveMembershipState(getContext().benefitSystemRepo, auth.userId, true);
  // 服务内部照旧拿行形状（auth 热路径、门控、额度都按列名读），只在这一处收成视图
  return NextResponse.json(membershipStatusViewOf(state), { headers: { "Cache-Control": "no-store" } });
});
