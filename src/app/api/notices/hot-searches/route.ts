/**
 * GET /api/notices/hot-searches — 首页「热门搜索」（真实检索行为聚合）
 *
 * @module app/api/notices/hot-searches/route
 * @description 与「热门国家/热门品目（数据覆盖榜）」是两个口径：
 *              - 本接口 = 最近 N 天真实检索词，按去重访客加权、单访客次数封顶、过门槛后排序；
 *              - 数据不足时返回 mode="fallback" 且 keywords 为空，前端回退到数据覆盖榜，
 *                绝不把「某个人的测试词」当全站热门展示。
 *              只对外暴露词/链接，不暴露搜索次数等小样本计数（隐私 + 防刷感知）。
 *              服务端 10 分钟内存缓存 + 响应 10 分钟 HTTP 缓存。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getHotSearches, hotSearchHref } from "@/lib/services/search-analytics";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  // 不传 window/limit 时由服务端配置（HOT_SEARCH_WINDOW_DAYS / HOT_SEARCH_LIMIT）决定
  const windowParam = sp.get("window");
  const limitParam = sp.get("limit");
  const data = await getHotSearches(getPool(), {
    windowDays: windowParam ? Number(windowParam) : undefined,
    limit: limitParam ? Number(limitParam) : undefined,
  });
  return NextResponse.json(
    {
      mode: data.mode,
      windowDays: data.windowDays,
      updatedAt: data.updatedAt,
      keywords: data.terms.map((t) => ({
        term: t.term,
        label: t.label,
        href: hotSearchHref(t.term),
      })),
    },
    { headers: { "Cache-Control": "public, max-age=600" } },
  );
});
