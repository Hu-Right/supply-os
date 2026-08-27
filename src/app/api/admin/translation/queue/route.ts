/**
 * GET /api/admin/translation/queue — 翻译队列状态（管理员）
 *
 * @module app/api/admin/translation/queue/route
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const ctx = getContext();

  try {
    // 查询翻译任务表统计
    const [pendingResult] = await ctx.dbPool.query(
      "SELECT COUNT(*) as cnt FROM notice_translations WHERE status = 'pending'",
    );
    const [processingResult] = await ctx.dbPool.query(
      "SELECT COUNT(*) as cnt FROM notice_translations WHERE status = 'processing'",
    );
    const pending = (pendingResult as any)[0]?.cnt || 0;
    const processing = (processingResult as any)[0]?.cnt || 0;
    return NextResponse.json({ pending, processing });
  } catch {
    // 表不存在时返回零值（首次部署尚未建表）
    return NextResponse.json({ pending: 0, processing: 0 });
  }
}
