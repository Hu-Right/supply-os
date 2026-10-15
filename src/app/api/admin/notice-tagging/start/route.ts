/**
 * POST /api/admin/notice-tagging/start — 启动一轮打标 { limit }
 * @description 人工触发口（AI 触发权归用户）：limit=本次处理条数上限（≤2000）。
 *              任务在服务进程后台跑，关闭页面不影响；进度走 status 轮询。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { requireAdminOrThrow } from "@/lib/services/admin-access";
import { getRunStatus, startTaggingRun } from "@/lib/services/commodity/notice-tagging";

const startBodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(2000),
});

export const POST = withRoute(async (req: NextRequest) => {
  await requireAdminOrThrow(req);
  const body = await parseJson(req, startBodySchema);
  const ret = startTaggingRun(body.limit);
  if (!ret.ok) return NextResponse.json({ ok: false, message: ret.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: ret.message, run: getRunStatus() });
});
