/**
 * 中标统计 API
 *
 * @module app/api/awards/stats/route
 * @description 返回中标数据的统计摘要，供 award-intelligence 仪表板使用。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export const dynamic = "force-dynamic";

/** GET /api/awards/stats — 统计摘要 */
export async function GET() {
  try {
    const ctx = getContext();
    const stats = await ctx.awardsRepo.getStats();

    return NextResponse.json(stats);
  } catch (err) {
    console.error("[/api/awards/stats] 统计查询失败:", err);
    return NextResponse.json(
      {
        error: "获取统计数据失败",
        total: 0,
        total_value_usd: 0,
        by_agency: [],
        by_country: [],
        by_month: [],
        top_winners: [],
      },
      { status: 500 },
    );
  }
}
