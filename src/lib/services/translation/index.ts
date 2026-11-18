/**
 * 翻译子系统 barrel re-export
 * Translation subsystem barrel re-export
 *
 * @module server/services/translation
 * @description 统一翻译子系统入口：
 *              - chain.ts   翻译链（用户 BYOK 单通道，失败即不可用）
 *              - notice.ts  公告翻译（含文字系统检测）
 *              - translation-flow.ts  按需详情翻译编排
 *              - fetchWithTimeout.ts  HTTP 超时封装
 */

export { translateViaChain, isDeepSeekCircuitBreakerOpen } from "./chain";
export type { TranslationCredentials } from "./chain";
export type { ChainResult, ChainSourceLang } from "./chain";

export {
  NOTICE_TRANSLATION_LANGS,
  pendingNoticeTranslations,
  translateNoticeViaChain,
  detectSourceLang,
  getTranslatedNoticeDetail,
} from "./notice";
