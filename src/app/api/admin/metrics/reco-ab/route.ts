/**
 * GET /api/admin/metrics/reco-ab — 推荐 AB 测试指标（管理员）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const sinceDays = Number(req.nextUrl.searchParams.get("since_days")) || 30;
  const ctx = getContext();
  const metrics = await ctx.admin.adminRepo.listRecoAbMetrics(sinceDays);
  return NextResponse.json(metrics);
}
