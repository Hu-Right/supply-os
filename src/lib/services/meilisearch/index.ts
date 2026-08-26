/**
 * Meilisearch 搜索引擎 — barrel re-export
 * Meilisearch search engine — barrel re-export
 *
 * @module server/services/meilisearch
 * @description 封装 Meilisearch SDK，提供索引管理、文档同步与健康检查。
 *              子模块拆分：
 *              - client.ts  客户端初始化 + 健康检查 + 索引配置
 *              - sync.ts    文档同步（全量/增量/按ID）
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
  fullSync,
  incrementalSync,
  syncNoticeIds,
  getMysqlActiveCount,
} from "./sync";

// utils/notice-type.ts（#8：归一化函数上移至领域工具层，保留 barrel 导出兼容既有导入）
export { normalizeNoticeType } from "../../utils/notice-type";
