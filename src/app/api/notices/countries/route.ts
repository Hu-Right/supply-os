/**
 * GET /api/notices/countries — 国家列表（带公告计数）
 *
 * @module app/api/notices/countries/route
 * @description 与 hot-topics/stats 同一口径：公开聚合数据，HTTP 层缓存 10 分钟，
 *              吸收首页多组件实例的重复拉取。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getNoticeCountries } from "@/lib/services/notice-search";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  const pool = getPool();
  const countries = await getNoticeCountries(pool);
  return NextResponse.json(countries, { headers: { "Cache-Control": "public, max-age=600" } });
});
