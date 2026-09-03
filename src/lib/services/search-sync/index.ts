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
  buildWideRow, loadAliasMap, upsertWideRows,
} from "./wide-row-builder";

// 对账层
export { reconcileDeadlineSec } from "./wide-row-reconcile";

// 同步调度层（对外门面）
export {
  fullBackfill, incrementalWideSync, syncWideIds,
  startWideTableSync,
} from "./sync-scheduler";
// 宽表就绪检查（A2 解环）：从无依赖叶子模块导出，供 orchestrator 侧直用
export { isWideTableReady } from "./wide-table-readiness";

// Meili 索引同步层（#8：自顶层 searchSync.ts 迁入，统一域名消除混淆）
export { startSearchSync } from "./meili-index-sync";
export type { SyncOptions } from "./meili-index-sync";

// 同步队列层（统一调度按 ID 同步请求）
export {
  enqueue, processQueue, clearQueue, getQueueSize, startQueueProcessor,
} from "./sync-queue";
