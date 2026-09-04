/**
 * POST /api/training/downloads/track — 下载追踪
 *
 * 匿名公开端点：加 IP 限流防计数刷高（审查 F34）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { getPool } from "@/lib/db/pool";
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
    return NextResponse.json({ code: 40000, message: "请求数据格式错误" }, { status: 400 });
  }
  const materialId = String(body.material_id || "").trim().slice(0, 60);
  const fileName = String(body.file_name || "").trim().slice(0, 120);
  if (!materialId) {
    return NextResponse.json({ code: 40000, message: "缺少资料 ID" }, { status: 400 });
  }

  const ctx = getContext();
  // 写入统计表（保留明细追踪能力）
  const count = await ctx.trainingRepo.incrementDownloadCount(materialId, fileName);

  // 同步递增 crm_learning_materials.downloads_count，保证前端展示数据源一致
  try {
    const pool = getPool();
    await pool.execute(
      "UPDATE crm_learning_materials SET downloads_count = downloads_count + 1 WHERE material_id = ?",
      [materialId],
    );
  } catch {
    // 非关键路径：即使同步失败也不影响下载追踪
  }

  return NextResponse.json({ success: true, count });
}
