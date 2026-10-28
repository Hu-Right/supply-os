/**
 * GET /api/catalog/country-name-map — 国家名展示映射（公开，24h 缓存）
 * 数据源＝ country_aliases（国家归一单一事实源）；不再用静态字典。
 *
 * 信封显式列举三个映射（命名红线② 2026-10-28）：`buildCountryNameMaps` 的返回类型
 * CountryNameMaps 本来只该是服务出口结构，`json(maps)` 等于它加一个字段就多一个对外键。
 * 映射内部的 key 是国家名/区域名（数据键，不是字段名），按口径不受命名红线约束。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { buildCountryNameMaps } from "@/lib/services/country/alias-store";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  const ctx = getContext();
  const maps = await buildCountryNameMaps(ctx.dbPool);
  return NextResponse.json(
    { countries: maps.countries, regions: maps.regions, zhToEn: maps.zhToEn },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
});
