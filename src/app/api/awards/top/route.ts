/**
 * 中标商排行 API
 *
 * @module app/api/awards/top/route
 * @description 返回中标商排行榜（按中标金额/次数排序）。
 *              薄壳路由：service 委托（lib/services/awards.service）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { getTopWinners } from "@/lib/services/awards.service";

export const dynamic = "force-dynamic";

/** GET /api/awards/top — 中标商排行 */
export const GET = withRoute(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));

  const result = await getTopWinners(getContext().dbPool, limit);
  return NextResponse.json(result);
});
