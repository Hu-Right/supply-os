/**
 * GET /api/industries/facets — 供应商行业级联下拉的第一级（门类）（公开，10min 缓存）
 *
 * @module app/api/industries/facets/route
 * @description 返回**门类一层**的完整分类树（status=1），每项 {key,nameZh,nameEn}，
 *              key 就是行业节点码（UGT-I-…）。自 2026-10-12 起不再按门户可见供应商数过滤：
 *              零挂靠的门类同样下发、同样可选，选中后列表正常返回「无结果」。
 *              数据源是行业面主表 industry_nodes（不再 JOIN 挂靠表）。
 *              与 GET /api/industries/tree?parent= 同形状，一起撑成四级级联下拉。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { loadIndustrySections } from "@/lib/services/industry-facets";

export const GET = withRoute(async () => {
  const sections = await loadIndustrySections(getContext().supplier.industryRepo);
  return NextResponse.json(sections, { headers: { "Cache-Control": "public, max-age=600" } });
});
