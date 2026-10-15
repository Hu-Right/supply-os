/**
 * POST /api/admin/notice-tagging/stop — 请求停止当前打标任务
 * @description 幂等：置停止标记，当前批次完成后退出，不中断在途单条判定。
 */
import { NextRequest, NextResponse } from "next/server";
import { withRoute } from "@/lib/middleware/route-handler";
import { requireAdminOrThrow } from "@/lib/services/admin-access";
import { getRunStatus, requestTaggingStop } from "@/lib/services/commodity/notice-tagging";

export const POST = withRoute(async (req: NextRequest) => {
  await requireAdminOrThrow(req);
  requestTaggingStop();
  return NextResponse.json({ ok: true, run: getRunStatus() });
});
