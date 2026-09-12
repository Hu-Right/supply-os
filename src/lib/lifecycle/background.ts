/**
 * 后台任务启动与关闭管理
 *
 * @module lib/lifecycle/background
 * @description Phase 2 第一档后台任务（10min+ 级）统一入口：
 *              - 自动翻译
 *              - 报告缓存清理
 *              - 5 类定时器
 *
 *              第二档 5s 级任务（searchSync/syncRetryQueue/wideTableSync/featuredSyncCallback）
 *              按迁移计划中期外置为独立 worker，不在这里启动。
 */
import type { Pool } from "mysql2/promise";
import { startAutoTranslate } from "../services/translation/auto";
import { startReportCacheCleanup } from "../services/reportCacheCleanup";
import { startAllTimers } from "./timers";
import { closePool } from "../db/pool";

export interface BackgroundHandle {
  stop: () => void;
}

export function startBackgroundTasks(dbPool: Pool): BackgroundHandle {
  // ── 自动翻译（可配置关闭）──
  const stopAutoTranslate = startAutoTranslate(dbPool, {
    enabled: String(process.env.NOTICE_AUTO_TRANSLATE ?? "on").toLowerCase() !== "off",
    intervalMs: Number(process.env.NOTICE_AUTO_TRANSLATE_INTERVAL_MS || 10 * 60 * 1000),
    maxPerRun: Number(process.env.NOTICE_AUTO_TRANSLATE_MAX || 300),
    descMaxChars: Number(process.env.NOTICE_AUTO_TRANSLATE_DESC_MAX_CHARS || 8000),
    dailyCharBudget: Number(process.env.NOTICE_AUTO_TRANSLATE_DAILY_CHARS || 7_000_000),
  });

  // ── 月度报告缓存清理 ──
  const stopReportCacheCleanup = startReportCacheCleanup({
    enabled: String(process.env.REPORT_CACHE_CLEANUP ?? "on").toLowerCase() !== "off",
    dbPool,
  });

  // ── 5 类定时器（is_featured/统计/国家/机构/桥接表/宽表清理）──
  const timersHandle = startAllTimers({ dbPool });

  return {
    stop() {
      stopAutoTranslate();
      stopReportCacheCleanup();
      timersHandle.stop();
    },
  };
}

let shutdownRegistered = false;

/**
 * 注册 SIGTERM/SIGINT 处理器（幂等，多次调用只注册一次）。
 * @param stop 停止后台任务的回调
 */
export function registerShutdownHooks(stop: () => void): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;

  const handler = async () => {
    console.log("[shutdown] 收到退出信号，开始优雅关闭…");
    // 1. 停止所有后台定时任务
    stop();
    // 2. 关闭数据库连接池（释放 MySQL 端连接，避免僵尸 Sleep）
    await closePool();
    // 3. 退出进程
    console.log("[shutdown] 优雅关闭完成");
    process.exit(0);
  };

  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);

  // 处理进程自然退出（无信号场景，如 uncaughtException 后退出）
  process.on("beforeExit", async () => {
    await closePool();
  });
}
