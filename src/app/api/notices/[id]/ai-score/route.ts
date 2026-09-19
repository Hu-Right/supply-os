/**
 * POST /api/notices/:id/ai-score — AI 适配评分
 *
 * @module app/api/notices/[id]/ai-score/route
 * @description 7 维度适配评分。缓存优先，forceRegenerate 强制重新评分。
 *              需要解锁校验（与 /detail 一致）。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { getOrGenerateAiScore } from "@/lib/services/ai-score";

const bodySchema = z.object({
  forceRegenerate: z.boolean().optional().default(false),
});

/** LLM 生成成本高（20-60s/次），按用户限流：10 分钟 6 次（含强制重新评分） */
const AI_SCORE_RATE = { windowMs: 10 * 60_000, maxAttempts: 6 };

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const rl = checkRateLimit(req, AI_SCORE_RATE, () => `ai_score:${auth.userId}`);
    if (rl) return rl;
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
    const result = await getOrGenerateAiScore(ctx.dbPool, auth.userId, noticeId, body.forceRegenerate);
    return NextResponse.json({ code: 0, message: "ok", data: result });
  },
);
