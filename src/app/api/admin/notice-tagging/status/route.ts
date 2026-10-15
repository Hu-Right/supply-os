/**
 * GET /api/admin/notice-tagging/status — 打标统计 + 运行状态
 * @description 覆盖统计（活跃公告口径）+ 队列积压 + 落点来源分布 + 当轮任务进度/用量。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { requireAdminOrThrow } from "@/lib/services/admin-access";
import { getRunStatus, getTaggingStats } from "@/lib/services/commodity/notice-tagging";

export const GET = withRoute(async (req: NextRequest) => {
  await requireAdminOrThrow(req);
  const [stats, run] = await Promise.all([getTaggingStats(getContext().dbPool), Promise.resolve(getRunStatus())]);
  return NextResponse.json({ stats, run });
});
