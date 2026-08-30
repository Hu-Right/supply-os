/**
 * POST /api/training/downloads/track — 下载追踪
 *
 * 匿名公开端点：加 IP 限流防计数刷高（审查 F34）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 30 },
    (r) => `dl_track:${extractClientIp(r)}`);
  if (rl) return rl;

  let body: { material_id?: unknown; file_name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 40000, message: "Invalid JSON" }, { status: 400 });
  }
  const materialId = String(body.material_id || "").trim().slice(0, 60);
  const fileName = String(body.file_name || "").trim().slice(0, 120);
  if (!materialId) {
    return NextResponse.json({ code: 40000, message: "material_id is required" }, { status: 400 });
  }

  const ctx = getContext();
  const count = await ctx.trainingRepo.incrementDownloadCount(materialId, fileName);
  return NextResponse.json({ success: true, count });
}
