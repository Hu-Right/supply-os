/**
 * GET /api/catalog/country-name-map — 国家名展示映射（公开，24h 缓存）
 * 数据源＝ country_aliases（国家归一单一事实源）；不再用静态字典。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { buildCountryNameMaps } from "@/lib/services/country/alias-store";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  const ctx = getContext();
  const maps = await buildCountryNameMaps(ctx.dbPool);
  return NextResponse.json(maps, { headers: { "Cache-Control": "public, max-age=86400" } });
});
