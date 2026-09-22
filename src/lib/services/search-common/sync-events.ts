/**
 * 搜索公共层 — 同步事件回调注册表
 * Search Common — sync event callback registry
 *
 * @module lib/services/search-common/sync-events
 * @description ARCH-P3-解环（2026-09-05）：search-sync 在同步完成后需要通知
 *              search-orchestrator 失效缓存，但直接 import 会形成循环依赖。
 *              本模块提供回调注册机制：orchestrator 启动时注册失效回调，
 *              sync 完成后通过注册表调用，双向依赖变为单向注册。
 */

type InvalidateSearchCacheFn = (userId?: number) => void;

let _invalidateCallback: InvalidateSearchCacheFn | null = null;

/** 注册搜索缓存失效回调（由 search-orchestrator 初始化时调用） */
export function registerInvalidateCallback(fn: InvalidateSearchCacheFn): void {
  _invalidateCallback = fn;
}

/** 触发搜索缓存失效（由 search-sync 同步完成后调用） */
export function invalidateSearchCache(userId?: number): void {
  _invalidateCallback?.(userId);
}
