/** 当前用户的生效套餐、订阅及额度账本。 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { resolveMembershipState } from "@/lib/services/membership-status";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const state = await resolveMembershipState(getContext().benefitSystemRepo, auth.userId, true);
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
});
