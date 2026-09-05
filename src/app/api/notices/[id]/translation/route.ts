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
import { getPool } from "@/lib/db/pool";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { NoticeDetailRepo } from "@/lib/repos/notices/notice-detail.repo";
import { NoticeTranslationRepo } from "@/lib/repos/notices/notice-translation.repo";
import { NOTICE_TRANSLATION_LANGS } from "@/lib/services/translation/notice";
import { getNoticeTranslation } from "@/lib/services/translation/translation-flow";

// ── GET /api/notices/[id]/translation — 公告翻译 ──
export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    // 限流（审查 F29）：按需翻译触发 LLM 调用链，防遍历公告 × 6 语言的费用滥用
    const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 30 }, () => `notice_tr:${auth.userId}`);
    if (rl) return rl;

    const { id } = await params;
    const noticeId = Number(id);
    const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "";

    if (!noticeId || !NOTICE_TRANSLATION_LANGS[lang]) {
      routeError(400, 40007, "无效的公告 ID 或语言参数");
    }

    // ARCH-P0（2026-09-05）：付费墙闸口 — 译文属解锁后内容，必须先校验解锁态
    // 此前未检查解锁状态，未付费用户可直接请求译文旁路 403 core_locked
    const ctx = getContext();
    const unlock = await ctx.notice.unlockRepo.findUnlock(auth.userId, noticeId);
    if (!unlock) routeError(403, 40013, "公告已锁定，请先解锁", { core_locked: true });

    const pool = getPool();
    const result = await getNoticeTranslation(
      { pool, detailRepo: new NoticeDetailRepo(pool), translationRepo: new NoticeTranslationRepo(pool) },
      noticeId,
      lang,
    );
    return NextResponse.json(result);
  },
);
