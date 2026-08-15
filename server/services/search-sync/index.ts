/**
 * 搜索宽表同步模块 — 统一导出
 * Search Wide Table Sync Module
 *
 * @module server/services/search-sync
 */

// 数据构建层
export {
  SUPPORTED_LANGS, WIDE_SYNC_SELECT, WIDE_SYNC_JOIN,
  loadTranslationsByNoticeIds, loadUnspscByNoticeIds,
  buildWideRow, loadAliasMap, reconcileDeadlineSec, upsertWideRows,
} from "./wide-row-builder";

// 同步调度层（对外门面）
export {
  fullBackfill, incrementalWideSync, syncWideIds,
  isWideTableReady, startWideTableSync,
} from "./sync-scheduler";

// 同步队列层（统一调度按 ID 同步请求）
export {
  enqueue, processQueue, clearQueue, getQueueSize, startQueueProcessor,
} from "./sync-queue";
