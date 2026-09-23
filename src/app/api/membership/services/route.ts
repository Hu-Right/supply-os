/**
 * GET /api/membership/services — 读取启用中的增值服务目录（公开只读）。
 *
 * 数据 SSOT：crm_service_catalog（is_active=1）。前端按 category 分组渲染，
 * standard_price 非空 → 收费下单分支；为空 → 客服码分支。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  const services = await getContext().benefitSystemRepo.listActiveServices();
  return NextResponse.json(services, { headers: { "Cache-Control": "no-store" } });
});
