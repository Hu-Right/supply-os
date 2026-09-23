/** 公开套餐及原生权益矩阵。 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  const table = await getContext().benefitSystemRepo.buildComparisonTable();
  return NextResponse.json(table, { headers: { "Cache-Control": "no-store" } });
});
