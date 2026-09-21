/**
 * POST /api/notices/:id/ai-match — AI 智能匹配
 *
 * @module app/api/notices/[id]/ai-match/route
 * @description 从用户供应商资源库中推荐 Top N 最匹配公告的供应商。
 *              缓存优先，forceRegenerate 强制重新匹配。需要解锁校验。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS, EC_VIP_ONLY } from "@/shared/constants/api";
import { getOrGenerateAiMatch } from "@/lib/services/ai-match";
import { hasFeature } from "@/lib/services/benefit-matrix";
import { AiSummaryRepo } from "@/lib/repos/ai-summary.repo";
import { UserSupplierPoolRepo } from "@/lib/repos/user-supplier-pool.repo";

const bodySchema = z.object({
  forceRegenerate: z.boolean().optional().default(false),
});

/** 单次匹配内部要并发调用多次 LLM（最多 5 家），按用户限流：10 分钟 6 次 */
const AI_MATCH_RATE = { windowMs: 10 * 60_000, maxAttempts: 6 };

/** GET /api/notices/:id/ai-match — 只读匹配缓存（不触发生成、不消耗 LLM），用于进详情页回读历史结果 */
export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }
    const ctx = getContext();
    const [cached, diagPending] = await Promise.all([
      new AiSummaryRepo(ctx.dbPool).findMatch(auth.userId, noticeId),
      new UserSupplierPoolRepo(ctx.dbPool).countDiagnosisPending(auth.userId),
    ]);
    if (!cached?.match_results) {
      return NextResponse.json({ code: 0, message: "ok", data: { cached: false, diagPending } });
    }
    try {
      const parsed = JSON.parse(cached.match_results);
      if (Array.isArray(parsed)) {
        return NextResponse.json({ code: 0, message: "ok", data: { cached: true, top: parsed, diagPending } });
      }
    } catch { /* 缓存损坏按无缓存处理 */ }
    return NextResponse.json({ code: 0, message: "ok", data: { cached: false, diagPending } });
  },
);

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const rl = checkRateLimit(req, AI_MATCH_RATE, () => `ai_match:${auth.userId}`);
    if (rl) return rl;
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }

    // V2 权益（ADR-0004 取代 ADR-0001）：智能匹配不再按身份封锁，仅保留下面“解锁 + 专业版档位”两道门；
    // 企业账号也可建立供应商资源库并使用智能匹配。
    const ctx = getContext();

    // 解锁校验
    const unlock = await ctx.notice.unlockRepo.findUnlock(auth.userId, noticeId);
    if (!unlock) routeError(403, 40013, "公告已锁定，请先解锁", { core_locked: true });

    // 档位闸门：AI 匹配与 AI 适配评分同属专业版（1299）起享权益（V2 权益 2026-09-21）
    const current = await ctx.user.membershipRepo.findCurrentBestPlan(auth.userId);
    if (!hasFeature(Number(current?.benefit_rank ?? 0), "ai_score")) {
      routeError(403, EC_VIP_ONLY, "AI 智能匹配为专业版权益", {
        feature: "ai_score",
        required_rank: 3,
      });
    }

    const body = await parseJson(req, bodySchema);
    const result = await getOrGenerateAiMatch(ctx.dbPool, auth.userId, noticeId, body.forceRegenerate);
    return NextResponse.json({ code: 0, message: "ok", data: result });
  },
);
