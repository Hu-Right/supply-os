/**
 * GET /api/admin/referral-leaderboard — 全员推荐排行榜
 *
 * 返回所有员工的推荐统计，按 total_referrals 降序。
 * 供管理后台及其他内部项目调用。
 *
 * @module app/api/admin/referral-leaderboard/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const ctx = getContext();
  try {
    const leaderboard = await ctx.user.invitationRepo.getLeaderboard();
    return NextResponse.json({ success: true, leaderboard });
  } catch (err: unknown) {
    const msg = (err as Error).message || "查询失败";
    return NextResponse.json({ code: 50000, message: msg }, { status: 500 });
  }
}
