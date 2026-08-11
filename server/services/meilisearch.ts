/**
 * Meilisearch 搜索引擎客户端
 * 已拆分至 meilisearch/ 子目录，本文件为向后兼容的 barrel re-export。
 * @see meilisearch/index.ts
 */
export {
  initMeilisearch,
  getClient,
  isHealthy,
  ensureIndex,
  getIndexStats,
  getLastSyncedId,
  getDocCount,
  hasOldSentinel,
  hasHasDeadlineField,
  normalizeNoticeType,
  fullSync,
  incrementalSync,
  syncNoticeIds,
  getMysqlActiveCount,
  searchWithFilters,
  toBeijingUnixTs,
} from "./meilisearch/index";
