/**
 * Meilisearch 搜索引擎 — barrel re-export
 * Meilisearch search engine — barrel re-export
 *
 * @module server/services/meilisearch
 * @description 封装 Meilisearch SDK，提供索引管理、文档同步与健康检查。
 *              子模块拆分：
 *              - client.ts  客户端初始化 + 健康检查 + 索引配置
 *              - sync.ts    文档同步（全量/增量/按ID）
 *              - search.ts  条件搜索
 */

// client.ts
export {
  initMeilisearch,
  getClient,
  isHealthy,
  markUnhealthy,
  tryRecover,
  getIndexName,
  ensureIndex,
  getIndexStats,
  getLastSyncedId,
  getDocCount,
  hasHasDeadlineField,
} from "./client";

// sync.ts
export {
  normalizeNoticeType,
  fullSync,
  incrementalSync,
  syncNoticeIds,
  getMysqlActiveCount,
} from "./sync";

// search.ts
export { searchWithFilters, toBeijingUnixTs } from "./search";
