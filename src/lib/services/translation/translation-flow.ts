/**
 * 公告翻译流程编排（架构评估 A4：自 notices/[id]/translation 路由下沉）
 *
 * @module lib/services/translation/translation-flow
 * @description 收口"按需公告翻译"的完整流程：中文快速路径（description_cn 直出 +
 *              标题异步翻译）与通用翻译路径。路由层只保留认证、限流、参数解析。
 *              业务失败以 RouteError（lib 级业务错误，含 status/code 元数据）抛出。
 */
import type { Pool } from "mysql2/promise";
import type { NoticeDetailRepo } from "../../repos/notices/notice-detail.repo";
import type { NoticeTranslationRepo } from "../../repos/notices/notice-translation.repo";
import { RouteError } from "../../middleware/route-handler";
import {
  getTranslatedNoticeDetail,
  detectSourceLang,
  translateNoticeViaChain,
} from "./notice";
import { findQualifiedOpportunityForNotice } from "../notices/index";
import { syncWideIds } from "../search-sync/index";

/** 通用路径返回的翻译载荷 */
type TranslationPayload = Awaited<ReturnType<typeof getTranslatedNoticeDetail>>;

/** 中文快速路径返回的载荷 */
interface ZhFastPathPayload {
  lang: "zh";
  title: string;
  description: string;
  cached: boolean;
  source: string;
}

export interface NoticeTranslationDeps {
  pool: Pool;
  detailRepo: NoticeDetailRepo;
  translationRepo: NoticeTranslationRepo;
}

/**
 * 获取公告翻译内容。
 * @returns 翻译载荷（路由直接 JSON 序列化返回）
 * @throws RouteError 503/50001 翻译服务暂不可用；404/40006 公告不存在
 */
export async function getNoticeTranslation(
  deps: NoticeTranslationDeps,
  noticeId: number,
  lang: string,
): Promise<TranslationPayload | ZhFastPathPayload> {
  const { pool, detailRepo, translationRepo } = deps;

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
          return {
            lang: "zh",
            title: cached.title_tr,
            description: descCn,
            cached: true,
            source: "description_cn",
          };
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
          return {
            lang: "zh",
            title,
            description: descCn,
            cached: false,
            source: "description_cn",
          };
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

    return result;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "TRANSLATION_UNAVAILABLE") {
      throw new RouteError(503, 50001, "翻译服务暂不可用");
    }
    if (err instanceof Error && err.message === "NOTICE_NOT_FOUND") {
      throw new RouteError(404, 40006, "公告不存在");
    }
    throw err;
  }
}
