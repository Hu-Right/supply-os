/**
 * GET /api/membership/upgrade/preview — 升级预览（需认证）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_UPGRADE_PLAN_REQUIRED } from "@/shared/constants/api";
import { upgradePreviewViewOf } from "@/lib/services/membership/view";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const { previewUpgrade } = await import("@/lib/services/membership-upgrade");
  const targetPlanCode = req.nextUrl.searchParams.get("target_plan_code")?.trim() || "";
  if (!targetPlanCode) {
    routeError(400, EC_UPGRADE_PLAN_REQUIRED, "请指定目标套餐");
  }
  const result = await previewUpgrade(getContext().benefitSystemRepo, auth.userId, targetPlanCode);
  return NextResponse.json(upgradePreviewViewOf(result), { headers: { "Cache-Control": "no-store" } });
});
