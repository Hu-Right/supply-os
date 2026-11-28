/**
 * 搜索同步模块 — 统一导出（宽表退役后）
 *
 * @module server/services/search-sync
 * @description 2026-11-28 宽表退役：本域只剩「服务表 → Meili 索引」的同步与调度，
 *              不再导出宽表构建/对账/指纹相关的任何入口。
 */

// 服务表增量重建 + 平台漂移检测（宽表退役后的同步回路）
export { startPublicSync } from "./sync-scheduler";
export type { PublicSyncOptions } from "./sync-scheduler";
export { detectPlatformStatusDrift } from "../notice-public/platform-drift";
export type { PlatformDrift } from "../notice-public/platform-drift";

// Meili 索引同步层（#8：自顶层 searchSync.ts 迁入，统一域名消除混淆）
export { startSearchSync } from "./meili-index-sync";
export type { SyncOptions } from "./meili-index-sync";

// 同步队列层（统一调度按 ID 同步请求）
export {
  enqueue, processQueue, clearQueue, getQueueSize, startQueueProcessor,
} from "./sync-queue";
