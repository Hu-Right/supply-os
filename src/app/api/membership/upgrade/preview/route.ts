/**
 * GET /api/membership/upgrade/preview — 升级预览（需认证）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const { previewUpgrade } = await import("@/lib/services/membership-upgrade");
  const targetPlanCode = req.nextUrl.searchParams.get("target_plan_code")?.trim() || "";
  if (!targetPlanCode) {
    routeError(400, 40000, "请指定目标套餐");
  }
  const result = await previewUpgrade(getContext().user.membershipRepo, auth.userId, targetPlanCode);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});
