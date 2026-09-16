/**
 * GET /api/catalog/country-name-map — 国家名映射（公开，24h 缓存）
 */
import { NextResponse } from "next/server";
import { COUNTRY_NAME_ZH, REGION_NAME_ZH, ZH_TO_EN } from "@/lib/data/countryNames";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  return NextResponse.json(
    { countries: COUNTRY_NAME_ZH, regions: REGION_NAME_ZH, zhToEn: ZH_TO_EN },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
});
