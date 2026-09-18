/**
 * POST /api/notices/:id/ai-match — AI 智能匹配
 *
 * @module app/api/notices/[id]/ai-match/route
 * @description 从用户供应商资源库中推荐 Top N 最匹配公告的供应商。
 *              缓存优先，forceRegenerate 强制重新匹配。需要解锁校验。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { getOrGenerateAiMatch } from "@/lib/services/ai-match";

const bodySchema = z.object({
  forceRegenerate: z.boolean().optional().default(false),
});

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }

    // 解锁校验
    const ctx = getContext();
    const unlock = await ctx.notice.unlockRepo.findUnlock(auth.userId, noticeId);
    if (!unlock) routeError(403, 40013, "公告已锁定，请先解锁", { core_locked: true });

    const body = await parseJson(req, bodySchema);
    const result = await getOrGenerateAiMatch(ctx.dbPool, auth.userId, noticeId, body.forceRegenerate);
    return NextResponse.json({ code: 0, message: "ok", data: result });
  },
);
