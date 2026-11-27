/**
 * GET /api/opportunities/:id/translation — 商机按需翻译
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import {
  NOTICE_TRANSLATION_LANGS,
  pendingNoticeTranslations,
  translateNoticeViaChain,
} from "@/lib/services/translation/notice";
import { EC_INVALID_PARAMS, EC_OPPORTUNITY_NOT_FOUND, EC_CONTENT_LOCKED } from "@/shared/constants/api";
import { resolveNoticeAccess } from "@/lib/services/notice-access";
import { resolveLlmCredentials } from "@/lib/services/ai/shared/llm-credentials";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    // 限流（审查 F29）：按需翻译触发 LLM 调用链，防遍历费用滥用
    const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 30 }, () => `opp_tr:${auth.userId}`);
    if (rl) return rl;

    const { id } = await params;
    const opportunityId = Number(id);
    const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "";

    if (!opportunityId || !NOTICE_TRANSLATION_LANGS[lang]) {
      routeError(400, EC_INVALID_PARAMS, "无效的机会 id 或语言参数");
    }

    const ctx = getContext();
    const oppsRepo = ctx.opportunitiesRepo;

    // ARCH-P0（2026-09-05）：付费墙闸口 — 商机译文属会员内容
    // 与 notices/[id]/translation 对齐：免费档一律 403 core_locked（2026-11-27 次数体系下线后，
    // 判定与公告侧同构：行业墙不适用商机，套餐 notice_view 权益格放行）
    const access = await resolveNoticeAccess({ userId: auth.userId, benefitRepo: ctx.benefitSystemRepo });
    if (!access.accessibleByPlan) {
      routeError(403, EC_CONTENT_LOCKED, "机会已锁定，请先开通会员", { coreLocked: true });
    }

    const cachedRow = await oppsRepo.findTranslationCache(opportunityId, lang);
    if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
      return NextResponse.json({ lang, title: cachedRow.title_tr, description: cachedRow.description_tr, cached: true });
    }

    const opp = await oppsRepo.findTextById(opportunityId);
    if (!opp) routeError(404, EC_OPPORTUNITY_NOT_FOUND, "机会不存在");

    // BYOK：商机翻译同样使用用户自己的大模型凭据（未配置时 400 EC_AI_NOT_CONFIGURED）
    const creds = await resolveLlmCredentials(ctx.dbPool, auth.userId);
    const pendingKey = `opp:${opportunityId}:${lang}`;
    let pending = pendingNoticeTranslations.get(pendingKey);
    if (!pending) {
      pending = translateNoticeViaChain(String(opp.title || ""), String(opp.description || ""), lang, undefined, creds);
      pendingNoticeTranslations.set(pendingKey, pending);
      pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
    }
    const { translations, provider, degradedFrom } = await pending;
    console.log(`[translate] target=opp:${opportunityId} lang=${lang} provider=${provider} degraded=${degradedFrom?.join(",") || "-"}`);

    if (provider === "same-lang-passthrough") {
      return NextResponse.json({ lang, title: translations[0], description: translations[1], cached: false, passthrough: true });
    }

    await oppsRepo.upsertTranslation(opportunityId, lang, translations[0], translations[1], provider);
    return NextResponse.json({ lang, title: translations[0], description: translations[1], cached: false });
  },
);
