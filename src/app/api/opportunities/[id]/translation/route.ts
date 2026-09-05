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
import { EC_INVALID_PARAMS, EC_OPPORTUNITY_NOT_FOUND } from "@/shared/constants/api";

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

    // ARCH-P0（2026-09-05）：付费墙闸口 — 商机译文属解锁后内容
    // 与 notices/[id]/translation 对齐：未解锁一律 403 core_locked
    const unlock = await oppsRepo.findExistingUnlock(auth.userId, opportunityId);
    if (!unlock) routeError(403, 40013, "机会已锁定，请先解锁", { core_locked: true });

    const cachedRow = await oppsRepo.findTranslationCache(opportunityId, lang);
    if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
      return NextResponse.json({ lang, title: cachedRow.title_tr, description: cachedRow.description_tr, cached: true });
    }

    const opp = await oppsRepo.findTextById(opportunityId);
    if (!opp) routeError(404, EC_OPPORTUNITY_NOT_FOUND, "机会不存在");

    const pendingKey = `opp:${opportunityId}:${lang}`;
    let pending = pendingNoticeTranslations.get(pendingKey);
    if (!pending) {
      pending = translateNoticeViaChain(String(opp.title || ""), String(opp.description || ""), lang);
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
