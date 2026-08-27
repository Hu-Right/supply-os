/**
 * POST /api/training/downloads/track — 下载追踪
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function POST(req: NextRequest) {
  const { material_id, file_name } = await req.json();
  const ctx = getContext();
  const count = await ctx.trainingRepo.incrementDownloadCount(material_id, file_name);
  return NextResponse.json({ success: true, count });
}
