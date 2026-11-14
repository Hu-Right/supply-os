/**
 * GET /api/procurement/plaza — 需求广场（公开，七步流程第 7 步的对外面）
 *
 * @module app/api/procurement/plaza/route
 * @description 已发布需求公开列表（按发布时间倒序；UGT 一级/关键词/分页）。
 *              首页三栏走 unified-search（bid_notices 投影链），广场这里读原生表
 *              以保留双语标题与完整公开字段（按 F02 分级授权裁剪）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { EC_INTERNAL_ERROR } from "@/shared/constants/api";
import { listPlaza } from "@/lib/services/procurement/projects";
import { projectSummaryViewOf } from "@/lib/services/procurement/views";

export const GET = withRoute(async (req: NextRequest) => {
  const url = new URL(req.url);
  const categoryL1 = url.searchParams.get("category_l1") || undefined;
  const keyword = url.searchParams.get("keyword") || undefined;
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("page_size") || 20);

  try {
    const { items, total } = await listPlaza(getPool(), { categoryL1, keyword, page, pageSize });
    /** 需求广场列表视图 */
    const plazaListViewOf = (rows: typeof items) => ({
      items: rows.map(projectSummaryViewOf),
      total,
      page,
      page_size: pageSize,
    });
    return NextResponse.json(plazaListViewOf(items));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/plaza] list failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "加载需求广场失败，请稍后重试");
  }
});
