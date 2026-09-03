/**
 * 公告翻译路由
 * Notice translation route
 *
 * @module app/api/notices/[id]/translation/route
 * @description 从 Express routes/notices/detail.routes.ts 迁移。
 *              获取公告的翻译内容，支持中文快速路径和通用翻译路径。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKey } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { NoticeDetailRepo } from "@/lib/repos/notices/notice-detail.repo";
import { NoticeTranslationRepo } from "@/lib/repos/notices/notice-translation.repo";
import {
  NOTICE_TRANSLATION_LANGS,
  getTranslatedNoticeDetail,
  detectSourceLang,
  translateNoticeViaChain,
} from "@/lib/services/translation/notice";
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices/index";
import { syncWideIds } from "@/lib/services/search-sync/index";

// ── 错误码定义 ──
const ApiErrorCode = {
  USER_REQUIRED: 40001,
  INVALID_NOTICE_OR_LANG: 40007,
  NOTICE_NOT_FOUND: 40006,
} as const;

function sendError(message: string, status: number, code: number) {
  return NextResponse.json(
    { code, message, error: message },
    { status },
  );
}

// ── GET /api/notices/[id]/translation — 公告翻译 ──
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  // 限流（审查 F29）：按需翻译触发 LLM 调用链，防遍历公告 × 6 语言的费用滥用
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 30 }, () => `notice_tr:${auth.userId}`);
  if (rl) return rl;

  const { id } = await params;
  const noticeId = Number(id);
  const lang = req.nextUrl.searchParams.get("lang")?.toLowerCase() || "";

  if (!noticeId || !NOTICE_TRANSLATION_LANGS[lang]) {
    return sendError("无效的公告 ID 或语言参数", 400, ApiErrorCode.INVALID_NOTICE_OR_LANG);
  }

  const pool = getPool();
  const detailRepo = new NoticeDetailRepo(pool);
  const translationRepo = new NoticeTranslationRepo(pool);

  // ── 中文快速路径：机会表 description_cn 直出（零翻译 API 调用）──
  if (lang === "zh") {
    const notice = await detailRepo.findDetail(noticeId);
    if (notice) {
      const opp = await findQualifiedOpportunityForNotice(pool, notice);
      const descCn = opp ? String(opp.description_cn || "").trim() : "";
      if (descCn) {
        const cached = await translationRepo.findTranslationCache(noticeId, "zh");
        if (cached?.title_tr) {
          // 最快路径：标题缓存 + description_cn 直出（< 100ms，零 API 成本）
          return NextResponse.json({
            lang: "zh",
            title: cached.title_tr,
            description: descCn,
            cached: true,
            source: "description_cn",
          });
        }
        // 标题未缓存：立即返回原文标题 + description_cn，标题翻译异步执行
        const title = String(notice.title || "").trim();
        if (title) {
          const srcLang = detectSourceLang(title, "") ?? undefined;
          // 原文已是中文：直接缓存标题，零 API 成本
          if (srcLang === "zh") {
            await translationRepo.upsertTranslation(noticeId, "zh", title, null, "same-lang-passthrough");
            // 通过统一路径同步宽表
            void syncWideIds(pool, [noticeId]).catch(() => {});
          } else {
            // 原文非中文：立即返回原文标题，标题翻译异步执行（下次访问命中缓存）
            void (async () => {
              try {
                const result = await translateNoticeViaChain(title, "", "zh", srcLang);
                if (result.provider !== "same-lang-passthrough" && result.translations[0]) {
                  await translationRepo.upsertTranslation(noticeId, "zh", result.translations[0], null, result.provider);
                  void syncWideIds(pool, [noticeId]).catch(() => {});
                }
              } catch {
                /* 异步标题翻译失败不影响当前响应 */
              }
            })();
          }
          return NextResponse.json({
            lang: "zh",
            title,
            description: descCn,
            cached: false,
            source: "description_cn",
          });
        }
      }
    }
  }

  // ── 通用路径 ──
  try {
    const result = await getTranslatedNoticeDetail(noticeId, lang, { detailRepo, translationRepo }, pool);

    // 通过统一路径同步宽表
    if (result.title && !result.cached) {
      void syncWideIds(pool, [noticeId]).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "TRANSLATION_UNAVAILABLE") {
      return sendError("翻译服务暂不可用", 503, 50001);
    }
    if (err instanceof Error && err.message === "NOTICE_NOT_FOUND") {
      return sendError("公告不存在", 404, ApiErrorCode.NOTICE_NOT_FOUND);
    }
    throw err;
  }
}
