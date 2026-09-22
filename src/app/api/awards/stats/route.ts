/**
 * 中标统计 API
 *
 * @module app/api/awards/stats/route
 * @description 返回中标数据的统计摘要，供 award-intelligence 仪表板使用。
 *              薄壳路由：service 委托（lib/services/awards.service）。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { getAwardStats } from "@/lib/services/awards.service";

export const dynamic = "force-dynamic";

/** GET /api/awards/stats — 统计摘要 */
export const GET = withRoute(async () => {
  const stats = await getAwardStats(getContext().dbPool);
  return NextResponse.json(stats);
});
