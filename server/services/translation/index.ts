/**
 * 翻译子系统 barrel re-export
 * Translation subsystem barrel re-export
 *
 * @module server/services/translation
 * @description 统一翻译子系统入口：
 *              - chain.ts   翻译链（DeepSeek→Gemini 降级）
 *              - auto.ts    增量双语翻译定时任务
 *              - retry.ts   批量翻译重试
 *              - notice.ts  公告翻译（含文字系统检测）
 *              - fetchWithTimeout.ts  HTTP 超时封装
 */

export { translateViaChain } from "./chain";
export type { ChainResult, ChainSourceLang } from "./chain";

export { startAutoTranslate, runIncrementalTranslation } from "./auto";
export type { AutoTranslateConfig } from "./auto";

export { runRetryTranslation, countPendingRetries, isRetryRunning, getLastRetryResult } from "./retry";
export type { RetryOptions } from "./retry";

export {
  NOTICE_TRANSLATION_LANGS,
  pendingNoticeTranslations,
  translateNoticeViaChain,
  detectSourceLang,
  getTranslatedNoticeDetail,
} from "./notice";
