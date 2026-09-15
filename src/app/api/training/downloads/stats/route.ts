/**
 * GET /api/training/downloads/stats — 下载统计（需登录）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const stats = await ctx.trainingRepo.listDownloadStats();
  return NextResponse.json(stats);
}
