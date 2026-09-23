/**
 * GET  /api/notices/:id/ai-summary — 只读缓存（不触发生成）
 * POST /api/notices/:id/ai-summary — 生成/获取 AI 拆标摘要
 *
 * @module app/api/notices/[id]/ai-summary/route
 * @description GET 仅查缓存：有则返回 {cached:true,data}，无则 {cached:false}，不调 LLM。
 *              POST 缓存优先；forceRegenerate=true 强制重新生成。
 *              业务逻辑委托 lib/services/ai-summary。
 *              V2 权益（2026-09-21）：摘要不再要求解锁——免费档（rank0）可看脱敏版
 *              （采购内容完整+资格条件截断，其余维度锁定），体验档及以上完整。
 *              生成走用户 BYOK 大模型凭证，平台无边际成本。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { getOrGenerateAiSummary } from "@/lib/services/ai-summary";
import { AiSummaryRepo } from "@/lib/repos/ai-summary.repo";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { AI_SUMMARY_BENEFIT, AI_SUMMARY_FULL_LEVEL, maskSummaryForFree } from "@/lib/services/benefit-matrix";

const bodySchema = z.object({
  forceRegenerate: z.boolean().optional().default(false),
});

/** LLM 生成成本高（20-60s/次），仅限流 POST 生成路径（GET 只读缓存不消耗 LLM）：10 分钟 6 次 */
const AI_SUMMARY_RATE = { windowMs: 10 * 60_000, maxAttempts: 6 };

/** 摘要脱敏判定：按矩阵 ai_summary 行的层级（1=部分脱敏 / 2=完整），不再比档位 */
async function shouldMaskSummary(userId: number): Promise<boolean> {
  const level = await getContext().benefitSystemRepo.levelForUser(userId, AI_SUMMARY_BENEFIT);
  return level < AI_SUMMARY_FULL_LEVEL;
}

/** GET：只读缓存，用于进页面时判断是否已有历史分析（不消耗 LLM） */
export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }
    const ctx = getContext();
    const repo = new AiSummaryRepo(ctx.dbPool);
    const cached = await repo.find(auth.userId, noticeId);
    if (!cached || !cached.core_deliverables) {
      return NextResponse.json({ code: 0, message: "ok", data: { cached: false } });
    }
    const full = {
      cached: true,
      coreDeliverables: cached.core_deliverables || "",
      keyQualifications: cached.key_qualifications || "",
      paymentCycle: cached.payment_cycle || "",
      competitiveLandscape: cached.competitive_landscape || "",
      bidStrategy: cached.bid_strategy || "",
      riskAlerts: cached.risk_alerts || "",
    };
    const data = (await shouldMaskSummary(auth.userId))
      ? { ...maskSummaryForFree(full), masked: true }
      : full;
    return NextResponse.json({ code: 0, message: "ok", data });
  },
);

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const rl = checkRateLimit(req, AI_SUMMARY_RATE, () => `ai_summary:${auth.userId}`);
    if (rl) return rl;
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }

    const body = await parseJson(req, bodySchema);
    const pool = getContext().dbPool;
    const result = await getOrGenerateAiSummary(pool, auth.userId, noticeId, body.forceRegenerate);
    const data = (await shouldMaskSummary(auth.userId))
      ? { ...maskSummaryForFree(result), masked: true }
      : result;
    return NextResponse.json({ code: 0, message: "ok", data });
  },
);
