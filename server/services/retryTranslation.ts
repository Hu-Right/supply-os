/**
 * 批量翻译重试服务
 * 已迁移至 translation/retry.ts，本文件为向后兼容的 barrel re-export。
 * @see translation/retry.ts
 */
export { runRetryTranslation, countPendingRetries, isRetryRunning, getLastRetryResult } from "./translation/retry";
export type { RetryOptions, RetryResult } from "./translation/retry";
