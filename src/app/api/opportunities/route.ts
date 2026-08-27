/**
 * 商机域路由（List / Unlocks / Translation / View / Unlock）
 * Opportunities domain routes
 *
 * @module app/api/opportunities/route
 * @description 从 Express routes/opportunities.routes.ts 迁移。
 *              涵盖：商机列表、解锁列表、按需翻译、浏览计数、解锁。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { normalizeUnspscCodes } from "@/server/services/unspsc/parser";
import { persistUserInterestCodes } from "@/server/services/unspsc/interest";
import {
  NOTICE_TRANSLATION_LANGS,
  pendingNoticeTranslations,
  translateNoticeViaChain,
} from "@/server/services/translation/notice";

// ── 错误码定义 ──
const ApiErrorCode = {
  INVALID_PARAMS: 40000,
  OPPORTUNITY_NOT_FOUND: 40403,
  FREE_LIMIT_REACHED: 41001,
  PAID_QUOTA_REQUIRED: 41002,
} as const;

function sendError(message: string, status: number, code: number) {
  return NextResponse.json({ code, message, error: message }, { status });
}

// ── GET 端点 ──
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  // GET /api/opportunities/unlocks — 用户已解锁商机
  if (path === "/api/opportunities/unlocks") {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;
    const ctx = getContext();
    const unlocks = await ctx.opportunitiesRepo.listUnlocks(auth.userKey);
    return NextResponse.json(unlocks);
  }

  // GET /api/opportunities/:id/translation — 商机按需翻译
  if (/^\/api\/opportunities\/\d+\/translation$/.test(path)) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const idMatch = path.match(/\/api\/opportunities\/(\d+)\/translation$/);
    const opportunityId = idMatch ? Number(idMatch[1]) : 0;
    const lang = url.searchParams.get("lang")?.toLowerCase() || "";

    if (!opportunityId || !NOTICE_TRANSLATION_LANGS[lang]) {
      return sendError("无效的机会 id 或语言参数", 400, ApiErrorCode.INVALID_PARAMS);
    }

    const ctx = getContext();
    const oppsRepo = ctx.opportunitiesRepo;

    const cachedRow = await oppsRepo.findTranslationCache(opportunityId, lang);
    if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
      return NextResponse.json({
        lang,
        title: cachedRow.title_tr,
        description: cachedRow.description_tr,
        cached: true,
      });
    }

    const opp = await oppsRepo.findTextById(opportunityId);
    if (!opp) return sendError("机会不存在", 404, ApiErrorCode.OPPORTUNITY_NOT_FOUND);

    const pendingKey = `opp:${opportunityId}:${lang}`;
    let pending = pendingNoticeTranslations.get(pendingKey);
    if (!pending) {
      pending = translateNoticeViaChain(String(opp.title || ""), String(opp.description || ""), lang);
      pendingNoticeTranslations.set(pendingKey, pending);
      pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
    }
    const started = Date.now();
    const { translations, provider, degradedFrom } = await pending;
    console.log(
      `[translate] target=opp:${opportunityId} lang=${lang} provider=${provider} ms=${Date.now() - started} degraded=${degradedFrom?.join(",") || "-"}`
    );

    if (provider === "same-lang-passthrough") {
      return NextResponse.json({
        lang,
        title: translations[0],
        description: translations[1],
        cached: false,
        passthrough: true,
      });
    }

    await oppsRepo.upsertTranslation(opportunityId, lang, translations[0], translations[1], provider);
    return NextResponse.json({ lang, title: translations[0], description: translations[1], cached: false });
  }

  // GET /api/opportunities — 商机列表（按 UNSPSC code）
  const ctx = getContext();
  const oppsRepo = ctx.opportunitiesRepo;
  const codeId = Number(url.searchParams.get("code_id") || url.searchParams.get("industry_id") || 0);
  if (codeId) {
    const items = await oppsRepo.listOpportunities(codeId);
    return NextResponse.json(
      items.map((row) => ({
        ...row,
        unspsc_codes: normalizeUnspscCodes(row.unspsc_codes),
      }))
    );
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}

// ── POST 端点 ──
export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const path = url.pathname;

  // POST /api/opportunities/:id/view — 浏览计数（带限流）
  if (/^\/api\/opportunities\/\d+\/view$/.test(path)) {
    // 限流检查
    const rateLimitResponse = checkRateLimit(req, {
      windowMs: 60_000,
      maxAttempts: 120,
    }, (r) => `opp_view:${auth.userKey}`);
    if (rateLimitResponse) return rateLimitResponse;

    const idMatch = path.match(/\/api\/opportunities\/(\d+)\/view$/);
    const opportunityId = idMatch ? Number(idMatch[1]) : 0;

    const ctx = getContext();
    const oppsRepo = ctx.opportunitiesRepo;

    await oppsRepo.insertView({
      userKey: auth.userKey,
      opportunityId,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "127.0.0.1",
    });
    await oppsRepo.incrementViewCount(opportunityId);
    return NextResponse.json({ success: true });
  }

  // POST /api/opportunities/:id/unlock — 商机解锁（带限流 + entitlement 校验）
  if (/^\/api\/opportunities\/\d+\/unlock$/.test(path)) {
    // 限流检查
    const rateLimitResponse = checkRateLimit(req, {
      windowMs: 60_000,
      maxAttempts: 30,
    }, (r) => `opp_unlock:${auth.userKey}`);
    if (rateLimitResponse) return rateLimitResponse;

    const idMatch = path.match(/\/api\/opportunities\/(\d+)\/unlock$/);
    const opportunityId = idMatch ? Number(idMatch[1]) : 0;

    const ctx = getContext();
    const { opportunitiesRepo: oppsRepo, dbPool } = ctx;
    const membershipRepo = ctx.payment.membershipRepo;

    const body = await req.json();
    const unlockType = body.unlock_type === "subscription" || body.unlock_type === "single"
      ? body.unlock_type
      : "free";

    // 服务端定价
    let price = 0;
    if (unlockType === "single") {
      const plans = await membershipRepo.findActivePlans();
      const singlePlan = plans.find((p) => p.plan_type === "single");
      price = Number(singlePlan?.price || 0);
    }

    const existing = await oppsRepo.findExistingUnlock(auth.userKey, opportunityId);
    if (existing) {
      return NextResponse.json({ success: true, alreadyUnlocked: true });
    }

    // 免费配额检查
    if (unlockType === "free") {
      const freeQuota = await membershipRepo.getFreeQuota();
      if (await membershipRepo.countFreeUnlocks(auth.userKey) >= freeQuota) {
        return sendError("免费查看次数已用完", 402, ApiErrorCode.FREE_LIMIT_REACHED);
      }
    }

    // 付费 entitlement 检查
    if (unlockType === "subscription" || unlockType === "single") {
      const activeEntitlements = await membershipRepo.findActiveEntitlements(auth.userKey);
      if (activeEntitlements.length === 0) {
        return sendError("付费查看次数已用完，请开通会员", 402, ApiErrorCode.PAID_QUOTA_REQUIRED);
      }
    }

    const opp = await oppsRepo.findById(opportunityId);
    if (!opp) return sendError("机会不存在", 404, ApiErrorCode.OPPORTUNITY_NOT_FOUND);
    const snapshot = normalizeUnspscCodes(opp.unspsc_codes);

    await oppsRepo.insertUnlock({
      userKey: auth.userKey,
      opportunityId,
      unlockType,
      price,
      unspscSnapshot: JSON.stringify(snapshot),
    });
    await oppsRepo.incrementUnlockCount(opportunityId);

    // 持久化用户兴趣码
    await persistUserInterestCodes(dbPool, auth.userKey, snapshot, "unlock_order", 2.50).catch(() => {});

    return NextResponse.json({ success: true, unlock_type: unlockType }, { status: 201 });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
