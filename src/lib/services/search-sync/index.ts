/**
 * 搜索宽表同步模块 — 统一导出
 * Search Wide Table Sync Module
 *
 * @module server/services/search-sync
 */

// 数据构建层
export {
  SUPPORTED_LANGS, wideSyncSelect, WIDE_SYNC_JOIN,
  loadTranslationsByNoticeIds, loadUnspscByNoticeIds,
  buildWideRow, loadAliasMap, upsertWideRows,
} from "./wide-row-builder";

// 对账层（只检测；修复统一走 syncWideIds / purgeNoticeSearch）
export {
  detectDeadlineDrift, detectPlatformStatusDrift, reconcileGhostRows,
  WIDE_DEADLINE_EXPR,
} from "./wide-row-reconcile";
export type { PlatformDrift } from "./wide-row-reconcile";
export {
  detectWideFingerprintDrift, WIDE_FP_EXPR, WIDE_FP_COLUMN, isFingerprintColumn,
} from "./wide-fingerprint";

// 同步调度层（对外门面）
export {
  fullBackfill, incrementalWideSync, syncWideIds,
  startWideTableSync,
} from "./sync-scheduler";
// 宽表就绪检查（A2 解环）：直接来自 search-common 权威实现
export { isWideTableReady } from "../search-common/wide-table-readiness";

// Meili 索引同步层（#8：自顶层 searchSync.ts 迁入，统一域名消除混淆）
export { startSearchSync } from "./meili-index-sync";
export type { SyncOptions } from "./meili-index-sync";

// 爬虫库 → 主表 同步层（应用内定时，替代独立 daily-sync.cjs cron）
export { runCrawlerSyncOnce, syncTable, SYNC_TABLES } from "./crawler-sync";
export type { Watermark, CrawlerSyncResult } from "./crawler-sync";
export { startCrawlerSync } from "./crawler-sync-scheduler";
export type { CrawlerSyncOptions } from "./crawler-sync-scheduler";

// 同步队列层（统一调度按 ID 同步请求）
export {
  enqueue, processQueue, clearQueue, getQueueSize, startQueueProcessor,
} from "./sync-queue";
