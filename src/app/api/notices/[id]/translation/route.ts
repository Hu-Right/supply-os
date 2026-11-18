/**
 * 公告翻译路由
 * Notice translation route
 *
 * @module app/api/notices/[id]/translation/route
 * @description 从 Express routes/notices/detail.routes.ts 迁移。
 *              A4 下沉后路由仅保留：认证、限流、参数解析与校验；
 *              编排见 lib/services/translation/translation-flow.ts。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { NOTICE_TRANSLATION_LANGS } from "@/lib/services/translation/notice";
import { NOTICE_TRANSLATION_BENEFIT } from "@/lib/services/benefit-matrix";
import { fetchNoticeTranslation } from "@/lib/services/notice-service";
import { assertNoticeContentAccess } from "@/lib/services/notice-access";

// ── GET /api/notices/[id]/translation — 公告翻译 ──
export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    // 限流（审查 F29）：按需翻译触发 LLM 调用链，防遍历公告 × 6 语言的费用滥用。
    const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 10 }, () => `notice_tr:${auth.userId}`);
    if (rl) return rl;

    const { id } = await params;
    const noticeId = Number(id);
    const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "";

    if (!noticeId || !NOTICE_TRANSLATION_LANGS[lang]) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID 或语言参数");
    }

    // 访问闸口（2026-11-18 收口）：行业墙 + 解锁/套餐 + 译文权益。
    // 原先只做了解锁/套餐判定，漏了行业墙——行业限定档用户可用订阅行业外的
    // 公告 ID 直接调本接口拿译文（等于旁路 /detail 的行业墙），故统一走公共闸口。
    const ctx = getContext();
    await assertNoticeContentAccess({
      dbPool: ctx.dbPool,
      benefitRepo: ctx.benefitSystemRepo,
      unlockRepo: ctx.notice.unlockRepo,
      userId: auth.userId,
      noticeId,
      benefit: NOTICE_TRANSLATION_BENEFIT,
      benefitMessage: "当前套餐不包含译文，仅可查看原文",
    });

    const result = await fetchNoticeTranslation(noticeId, lang, auth.userId);
    return NextResponse.json(result);
  },
);
