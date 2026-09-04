/**
 * GET /api/opportunities/:id/translation — 商机按需翻译
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import {
  NOTICE_TRANSLATION_LANGS,
  pendingNoticeTranslations,
  translateNoticeViaChain,
} from "@/lib/services/translation/notice";
import { EC_INVALID_PARAMS, EC_OPPORTUNITY_NOT_FOUND } from "@/shared/constants/api";

function sendError(message: string, status: number, code: number) {
  return NextResponse.json({ code, message, error: message }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  // 限流（审查 F29）：按需翻译触发 LLM 调用链，防遍历费用滥用
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 30 }, () => `opp_tr:${auth.userId}`);
  if (rl) return rl;

  const { id } = await params;
  const opportunityId = Number(id);
  const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "";

  if (!opportunityId || !NOTICE_TRANSLATION_LANGS[lang]) {
    return sendError("无效的机会 id 或语言参数", 400, EC_INVALID_PARAMS);
  }

  const ctx = getContext();
  const oppsRepo = ctx.opportunitiesRepo;

  const cachedRow = await oppsRepo.findTranslationCache(opportunityId, lang);
  if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
    return NextResponse.json({ lang, title: cachedRow.title_tr, description: cachedRow.description_tr, cached: true });
  }

  const opp = await oppsRepo.findTextById(opportunityId);
  if (!opp) return sendError("机会不存在", 404, EC_OPPORTUNITY_NOT_FOUND);

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
}
