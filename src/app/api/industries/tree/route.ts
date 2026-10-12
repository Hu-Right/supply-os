/**
 * GET /api/industries/tree — 供应商行业级联选项（大类 → 中类 → 小类）
 *
 * @module app/api/industries/tree/route
 * @description 供应商页行业级联下拉第 2~4 级的取数口（10min 缓存，与 /api/industries/facets 同一节奏）。
 *   `parent` 取某一层行业码（UGT-I- + 2/4/6 位），返回它的**全部直接子节点**（status=1，按码序）。
 *   自 2026-10-12 起不再按门户可见供应商数过滤：零挂靠子级同样下发、同样可选，
 *   选中后列表正常返回「无结果」。第一级（门类）不经此口：前端用 /api/industries/facets。
 *   返回项的 key 就是行业节点码，与 GET /api/suppliers?industry_code= 同口径（选中即可直接按子树筛）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { isIndustryCode } from "@/lib/services/industry-code";
import { loadIndustryChildren } from "@/lib/services/industry-facets";

export const GET = withRoute(async (req: NextRequest) => {
  const parent = (req.nextUrl.searchParams.get("parent") || "").trim().slice(0, 40);
  if (!isIndustryCode(parent)) {
    routeError(400, EC_INVALID_PARAMS, "parent 需为行业码（UGT-I- + 2/4/6/8 位）");
  }
  const options = await loadIndustryChildren(getContext().supplier.industryRepo, parent);
  return NextResponse.json(options, { headers: { "Cache-Control": "public, max-age=600" } });
});
