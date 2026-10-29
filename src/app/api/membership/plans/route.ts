/** 公开套餐及原生权益矩阵（按 commercial_tier 归组去重，官网三档形态）。 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { tieredComparisonViewOf } from "@/lib/services/membership/view";

export const GET = withRoute(async () => {
  const table = await getContext().benefitSystemRepo.buildComparisonTable();
  // 整块透出前先过会员视图：列名属于存储层，不得当对外契约（红线②）；
  // 归组/隐藏行也只在视图层收口，目录与门控不受影响
  return NextResponse.json(tieredComparisonViewOf(table), { headers: { "Cache-Control": "no-store" } });
});
