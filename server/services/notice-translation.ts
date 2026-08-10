/**
 * 公告翻译服务
 * 已迁移至 translation/notice.ts，本文件为向后兼容的 barrel re-export。
 * @see translation/notice.ts
 */
export {
  NOTICE_TRANSLATION_LANGS,
  pendingNoticeTranslations,
  translateNoticeViaChain,
  detectSourceLang,
  getTranslatedNoticeDetail,
} from "./translation/notice";
