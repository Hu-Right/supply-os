/**
 * GET /api/opportunities/unlocks — 用户已解锁商机
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;
  const ctx = getContext();
  const unlocks = await ctx.opportunitiesRepo.listUnlocks(auth.userKey);
  return NextResponse.json(unlocks);
}
