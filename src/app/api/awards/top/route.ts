/**
 * 中标商排行 API
 *
 * @module app/api/awards/top/route
 * @description 返回中标商排行榜（按中标金额/次数排序）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export const dynamic = "force-dynamic";

/** GET /api/awards/top — 中标商排行 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));

  try {
    const ctx = getContext();
    const winners = await ctx.awardsRepo.topWinners(limit);

    return NextResponse.json({ items: winners, total: winners.length });
  } catch (err) {
    console.error("[/api/awards/top] 排行查询失败:", err);
    return NextResponse.json(
      { error: "获取排行数据失败", items: [], total: 0 },
      { status: 500 },
    );
  }
}
