/**
 * POST /api/training/downloads/track — 下载追踪
 *
 * 匿名公开端点：加 IP 限流防计数刷高（审查 F34）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

export const POST = withRoute(async (req: NextRequest) => {
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 30 },
    (r) => `dl_track:${extractClientIp(r)}`);
  if (rl) return rl;

  let body: { material_id?: unknown; file_name?: unknown };
  try {
    body = await req.json();
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }
  const materialId = String(body.material_id || "").trim().slice(0, 60);
  if (!materialId) {
    routeError(400, EC_INVALID_PARAMS, "缺少资料 ID");
  }

  // 单一权威计数源：learning_materials.downloads_count（前端 MaterialCard 展示口径）
  const ctx = getContext();
  await ctx.dbPool.execute(
    "UPDATE learning_materials SET downloads_count = downloads_count + 1 WHERE material_id = ?",
    [materialId],
  );

  return NextResponse.json({ success: true });
});
