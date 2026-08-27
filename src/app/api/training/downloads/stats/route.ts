/**
 * GET /api/training/downloads/stats — 下载统计
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET() {
  const ctx = getContext();
  const stats = await ctx.trainingRepo.listDownloadStats();
  return NextResponse.json(stats);
}
