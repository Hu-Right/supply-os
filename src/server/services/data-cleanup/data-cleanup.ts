/**
 * 公告附属数据脏数据清理服务（翻译表 + 搜索宽表）
 * Notice Dependent-data Stale Data Cleanup Service
 *
 * @module server/services/data-cleanup/data-cleanup
 * @description 比对 crm_bid_notices（主表）与两个附属数据源，清理"主表已不存在
 *              （或已失效）"的记录，与桥接表清理（bridge-cleanup.ts）模式一致：
 *              统计 → 备份 → 分批删除 → 日志报告，供一次性清理脚本
 *              （scripts/cleanup-notice-data.ts）与后台定时任务
 *              （server/lifecycle/timers.ts）复用。
 *
 *              关联口径（已按 INFORMATION_SCHEMA 实际结构核实）：
 *              - crm_notice_translations.notice_id（BIGINT）→ crm_bid_notices.id
 *              - crm_notice_search.notice_id（VARCHAR）→ crm_bid_notices.notice_id（外部编号）
 *
 *              过期口径与桥接表一致：主表 is_expired = 1 视为已失效；
 *              默认仅清理"主表完全不存在"的硬死数据，过期数据通过
 *              includeExpired 显式开启（公告未来若被同步任务回填时仍可恢复，
 *              保守默认不删）。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { createLogger } from "../../utils/fileLogger";
import { type CleanupTarget, type CleanupOptions, type CleanupStats, runStaleDataCleanup, countStaleData } from "./engine";

const logger = createLogger("data-cleanup");

export type CleanupTargetKey = "translations" | "wide";

/** 清理目标配置表 */
export const CLEANUP_TARGETS: Record<CleanupTargetKey, CleanupTarget> = {
  // 翻译表 notice_id 是 BIGINT，存的是主表自增 id
  translations: {
    table: "crm_notice_translations",
    idColumn: "id",
    joinColumn: "notice_id",
    mainJoinColumn: "id",
    backupPrefix: "crm_notice_translations_backup",
  },
  // 宽表 notice_id 是外部公告编号（与主表 notice_id 同源，与桥接表一致）
  wide: {
    table: "crm_notice_search",
    idColumn: "id",
    joinColumn: "notice_id",
    mainJoinColumn: "notice_id",
    backupPrefix: "crm_notice_search_backup",
  },
};

export interface NoticeDataCleanupOptions extends CleanupOptions {}

export interface NoticeDataCleanupStats extends CleanupStats {}

/**
 * 统计附属数据源脏数据（只读，不修改任何数据）
 * 供 CLI 脚本 dry-run 模式使用
 */
export async function countStaleNoticeData(
  pool: Pool,
  targetKey: CleanupTargetKey,
  includeExpired = false,
): Promise<{ tableTotal: number; orphanRows: number; expiredRows: number }> {
  const target = CLEANUP_TARGETS[targetKey];
  return countStaleData(pool, target, includeExpired);
}

/**
 * 清理附属数据源脏数据
 */
export async function cleanupStaleNoticeData(
  pool: Pool,
  targetKey: CleanupTargetKey,
  options: NoticeDataCleanupOptions = {},
): Promise<NoticeDataCleanupStats> {
  const target = CLEANUP_TARGETS[targetKey];
  const prefixedLogger = {
    info: (msg: string) => logger.info(`[${targetKey}] ${msg}`),
  };
  return runStaleDataCleanup(pool, target, options, prefixedLogger);
}
