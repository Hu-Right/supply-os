/**
 * 公告 API 支持的语言白名单
 * Notice API supported languages
 *
 * @module shared/constants/langs
 * @description 公告解锁/收藏等列表接口按需返回译文，仅接受以下六种界面语言作为
 *              lang 参数。收编此前散落在 features/payment/api 与 procurement hooks
 *              中逐字重复的 NOTICE_API_LANGS（SSOT）。
 *              与 core/i18n 的 Locale 口径**刻意不同**：pt（2026-10-28 新增）只做界面
 *              层翻译，公告译文未进译链与宽表列（见 lib/utils/languages.ts），
 *              葡语界面下公告内容回落 en——新增界面语言不一定等于新增译文语言。
 */

/** 公告 API 可请求译文的目标语言（zh/en/fr/ru/es/ar） */
// 本地差异 #18：库内存在中文原文公告，en 也需请求译文（英文原文由服务端内容检测直通返回，不耗 API）
export const NOTICE_API_LANGS: ReadonlySet<string> = new Set([
  "zh", "en", "fr", "ru", "es", "ar",
]);

/** 归一化界面语言：命中白名单返回该语言，否则 undefined（表示不请求译文） */
export function pickNoticeApiLang(locale?: string | null): string | undefined {
  return locale && NOTICE_API_LANGS.has(locale) ? locale : undefined;
}
