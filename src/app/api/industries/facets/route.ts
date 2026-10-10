/**
 * GET /api/industries/facets — 供应商行业筛选面（公开，10min 缓存）
 *
 * @module app/api/industries/facets/route
 * @description 返回**门类一层**的扁平行业选项，每项带子树内门户可见供应商数。
 *              大类以下不在这里铺（英文侧 37 个大类与门类同名，铺成 chip 只会把粒度缺陷
 *              放大成视觉噪音），那一级由 GET /api/suppliers?industry_q= 的关键词框接。
 *              数据源是行业面主表 crm_industry_nodes + 挂靠表，不再是 supplier.industry
 *              自由文本去重。零挂靠节点不出现，所以 chip 里的每一项点开都有结果。
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
