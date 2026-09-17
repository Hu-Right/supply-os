/**
 * 中标数据 API
 *
 * @module app/api/awards/route
 * @description 提供中标记录的分页查询、统计摘要等接口。
 *              供 award-intelligence 前端页面消费。
 *
 * 端点:
 *   GET /api/awards          — 分页查询中标记录
 *   GET /api/awards/stats    — 统计摘要（仪表板数据）
 *   GET /api/awards/top      — 中标商排行榜
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export const dynamic = "force-dynamic";

/** GET /api/awards — 分页查询中标记录 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("page_size") || 20)));
  const agency = searchParams.get("agency") || undefined;
  const country = searchParams.get("country") || undefined;
  const keyword = searchParams.get("keyword") || searchParams.get("q") || undefined;
  const dateFrom = searchParams.get("date_from") || undefined;
  const dateTo = searchParams.get("date_to") || undefined;
  const minAmount = searchParams.get("min_amount") ? Number(searchParams.get("min_amount")) : undefined;
  const maxAmount = searchParams.get("max_amount") ? Number(searchParams.get("max_amount")) : undefined;
  const sortBy = (searchParams.get("sort_by") as "award_date" | "contract_value_usd") || "award_date";
  const sortDir = (searchParams.get("sort_dir") as "asc" | "desc") || "desc";

  try {
    const ctx = getContext();
    const result = await ctx.awardsRepo.list({
      page,
      pageSize,
      agency,
      country,
      keyword,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      sortBy,
      sortDir,
    });

    return NextResponse.json({
      items: result.items,
      total: result.total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(result.total / pageSize),
    });
  } catch (err) {
    console.error("[/api/awards] 查询失败:", err);
    return NextResponse.json(
      { error: "查询中标数据失败", items: [], total: 0 },
      { status: 500 },
    );
  }
}
