/**
 * 数据清理模块 — 统一导出入口
 * Data Cleanup Module — Unified Export Entry
 *
 * @module server/services/data-cleanup
 * @description 通用脏数据清理引擎及具体清理服务。
 */

// 通用引擎
export type { CleanupTarget, CleanupOptions, CleanupStats } from "./engine";
export { runStaleDataCleanup, countStaleData } from "./engine";

// 桥接表清理
export { cleanupStaleNoticeBridge, countStaleBridgeRows } from "./bridge-cleanup";
export type { BridgeCleanupOptions, BridgeCleanupStats } from "./bridge-cleanup";

// 附属数据清理
export { cleanupStaleNoticeData, countStaleNoticeData, CLEANUP_TARGETS } from "./data-cleanup";
export type { CleanupTargetKey, NoticeDataCleanupOptions, NoticeDataCleanupStats } from "./data-cleanup";
