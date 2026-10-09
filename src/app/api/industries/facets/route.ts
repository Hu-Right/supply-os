/**
 * GET /api/industries/facets — 供应商行业筛选面（公开，10min 缓存）
 *
 * @module app/api/industries/facets/route
 * @description 返回「门类 → 大类」两级行业选项，每项带子树内门户可见供应商数。
 *              数据源是行业面主表 crm_industry_nodes + 挂靠表，不再是 supplier.industry
 *              自由文本去重。零挂靠节点不出现，所以下拉里的每个选项点开都有结果。
 *              与 GET /api/suppliers?industry_code= 同口径（同一张表、同一个可见谓词）。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { loadIndustryFacets } from "@/lib/services/industry-facets";

export const GET = withRoute(async () => {
  const groups = await loadIndustryFacets(getContext().supplier.industryRepo);
  return NextResponse.json(groups, { headers: { "Cache-Control": "public, max-age=600" } });
});
