/**
 * GET /api/opportunities/unlocks — 用户已解锁商机
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const unlocks = await ctx.opportunitiesRepo.listUnlocks(auth.userId);
  return NextResponse.json(unlocks);
});
