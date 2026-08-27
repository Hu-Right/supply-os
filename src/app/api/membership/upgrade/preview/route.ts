/**
 * GET /api/membership/upgrade/preview — 升级预览（需认证）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/server/db/context";
import { requireUserKey } from "@/server/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { previewUpgrade } = await import("@/server/services/membership-upgrade");
  const targetPlanCode = req.nextUrl.searchParams.get("target_plan_code")?.trim() || "";
  if (!targetPlanCode) {
    return NextResponse.json({ code: 40000, message: "请指定目标套餐" }, { status: 400 });
  }
  const result = await previewUpgrade(getContext().user.membershipRepo, auth.userKey, targetPlanCode);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
