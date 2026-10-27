/**
 * GET /api/opportunities/unlocks — 用户已解锁商机
 *
 * 响应体由服务层出 camelCase 视图（listUserOpportunityUnlocks），
 * 本路由只鉴权 + 拼装，不再把 repo 行整行透出。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { listUserOpportunityUnlocks } from "@/lib/services/opportunity-unlock";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const unlocks = await listUserOpportunityUnlocks(ctx.opportunitiesRepo, auth.userId);
  return NextResponse.json(unlocks);
});
