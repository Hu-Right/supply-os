/**
 * POST /api/notices/:id/ai-summary — 生成/获取 AI 拆标摘要
 *
 * @module app/api/notices/[id]/ai-summary/route
 * @description 缓存优先；forceRegenerate=true 强制重新生成。
 *              业务逻辑委托 lib/services/ai-summary。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { getOrGenerateAiSummary } from "@/lib/services/ai-summary";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

const bodySchema = z.object({
  forceRegenerate: z.boolean().optional().default(false),
});

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }

    // 解锁校验：AI 摘要属于公告完整内容的一部分，未解锁不可访问
    const ctx = getContext();
    const unlock = await ctx.notice.unlockRepo.findUnlock(auth.userId, noticeId);
    if (!unlock) routeError(403, 40013, "公告已锁定，请先解锁", { core_locked: true });

    const body = await parseJson(req, bodySchema);
    const pool = ctx.dbPool;
    const result = await getOrGenerateAiSummary(pool, auth.userId, noticeId, body.forceRegenerate);
    return NextResponse.json({ code: 0, message: "ok", data: result });
  },
);
