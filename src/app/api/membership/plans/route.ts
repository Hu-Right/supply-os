/** 公开套餐及原生权益矩阵。 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { comparisonViewOf } from "@/lib/services/membership/view";

export const GET = withRoute(async () => {
  const table = await getContext().benefitSystemRepo.buildComparisonTable();
  // 整块透出前先过会员视图：列名属于存储层，不得当对外契约（红线②）
  return NextResponse.json(comparisonViewOf(table), { headers: { "Cache-Control": "no-store" } });
});
