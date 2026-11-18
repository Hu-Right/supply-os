/**
 * GET /api/opportunities/access-ids — 用户已解锁商机
 *
 * 响应体由服务层出 camelCase 视图（listUserOpportunityAccessRecords），
 * 本路由只鉴权 + 拼装，不再把 repo 行整行透出。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { listUserOpportunityAccessRecords } from "@/lib/services/opportunity-access";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const records = await listUserOpportunityAccessRecords(ctx.opportunitiesRepo, auth.userId);
  return NextResponse.json(records);
});
