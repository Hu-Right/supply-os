/**
 * POST /api/notices/:id/ai-match — 供应商适配统一评估
 *
 * @module app/api/notices/[id]/ai-match/route
 * @description 统一评估：候选 = {我绑定的自己} ∪ {资源库工厂/友商}，同一 7 维引擎逐一打分后排序。
 *              缓存优先，forceRegenerate 强制重评。需要解锁校验 + 专业版档位。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS, EC_VIP_ONLY, EC_CONTENT_LOCKED, EC_PAID_QUOTA_REQUIRED } from "@/shared/constants/api";
import { getOrGenerateAiMatch, parseFreshMatchCache } from "@/lib/services/ai-match";
import { AiSummaryRepo } from "@/lib/repos/ai-summary.repo";
import { UserSupplierPoolRepo } from "@/lib/repos/user-supplier-pool.repo";
import { consumeAiActionQuota, AiQuotaExceededError } from "@/lib/services/ai-quota";
import { AI_MATCH_QUOTA_BENEFIT } from "@/lib/services/benefit-matrix";

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
    // 走法②：无 ai_match 权益（低档）即使有历史缓存也不回读，防直接打接口绕过（与 POST 门控对称）
    if (!(await ctx.benefitSystemRepo.isEntitled(auth.userId, "ai_match"))) {
      return NextResponse.json({ cached: false, locked: true });
    }
    const [cached, diagPending] = await Promise.all([
      new AiSummaryRepo(ctx.dbPool).findMatch(auth.userId, noticeId),
      new UserSupplierPoolRepo(ctx.dbPool).countDiagnosisPending(auth.userId),
    ]);
    if (!cached?.match_results) {
      return NextResponse.json({ cached: false, diagPending });
    }
    try {
      const parsed = JSON.parse(cached.match_results);
      // 与 service 缓存闸同一口径（2026-10-28 红线②）：旧缓存里仍是 pool_id/supplier_id 列名，
      // 不能原样吐上网 → 按「无缓存」回空，用户下次评估自然重算（不做 camel↔snake 桥接）。
      if (
        Array.isArray(parsed) &&
        parsed.every((i) => i && typeof i === "object" && "supplierId" in i)
      ) {
        return NextResponse.json({ cached: true, top: parsed, diagPending });
      }
    } catch { /* 缓存损坏按无缓存处理 */ }
    return NextResponse.json({ cached: false, diagPending });
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
    if (!unlock) routeError(403, EC_CONTENT_LOCKED, "公告已锁定，请先解锁", { core_locked: true });

    // 权益闸门：AI 智能匹配按矩阵 ai_match 行判定（价格文档为唯一事实源，不再比档位）
    if (!(await ctx.benefitSystemRepo.isEntitled(auth.userId, "ai_match"))) {
      routeError(403, EC_VIP_ONLY, "AI 智能匹配为该档不包含的权益", {
        feature: "ai_match",
        benefit_code: "ai_match",
      });
    }

    const body = await parseJson(req, bodySchema);

    // 享有 ai_match（enum>=1）且矩阵给了有限月度额度（ai_match_quota，个人 30/月）→ 生成前扣 1；
    // -1 不限与矩阵缺行（迁移前旧库）不计量。缓存命中不产生 LLM 成本，同样不扣
    // （命中口径与 getOrGenerateAiMatch 一致：forceRegenerate 必生成，否则须是新版结构缓存）。
    const cached = body.forceRegenerate
      ? null
      : await new AiSummaryRepo(ctx.dbPool).findMatch(auth.userId, noticeId);
    if (body.forceRegenerate || !parseFreshMatchCache(cached?.match_results)) {
      try {
        await consumeAiActionQuota(ctx.dbPool, { catalog: ctx.benefitSystemRepo, write: ctx.benefitWriteRepo }, {
          userId: auth.userId,
          benefitCode: AI_MATCH_QUOTA_BENEFIT,
        });
      } catch (err) {
        if (err instanceof AiQuotaExceededError) {
          routeError(402, EC_PAID_QUOTA_REQUIRED, "本月 AI 智能匹配次数已用完，请升级套餐或下月再试", {
            feature: "ai_match",
            benefit_code: AI_MATCH_QUOTA_BENEFIT,
          });
        }
        throw err;
      }
    }

    const result = await getOrGenerateAiMatch(ctx.dbPool, auth.userId, noticeId, body.forceRegenerate);
    return NextResponse.json(result);
  },
);
