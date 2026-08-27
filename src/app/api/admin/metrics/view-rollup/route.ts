/**
 * GET /api/admin/metrics/view-rollup — 视图汇总统计（管理员）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const ctx = getContext();
  const stats = await ctx.admin.adminRepo.getViewRollupStats();
  return NextResponse.json(stats);
}
