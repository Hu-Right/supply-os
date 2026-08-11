/**
 * 启动定时器管理
 * Centralized timer management for periodic background tasks
 *
 * @module server/lifecycle/timers
 * @description 将所有定时任务（is_active 刷新、is_featured 刷新、国家/机构缓存刷新）
 *              集中管理，返回统一的 stop 函数。
 */
import type { Pool } from "mysql2/promise";
import { refreshFeaturedColumn } from "../services/notices";
import { refreshNoticeStats, refreshIsActive, refreshNoticeCountries, refreshNoticeAgencies } from "../services/noticeSearch";
import { syncNoticeIds, isHealthy as isMeiliHealthy } from "../services/meilisearch";

/**
 * 每天在指定小时（本地时区）执行一次回调，返回可 clearTimeout 的 timer。
 * 内部用 setTimeout 链式调度：每次计算到目标时刻的毫秒数，执行后重新调度。
 */
function scheduleDailyAt(hour: number, cb: () => Promise<void>): NodeJS.Timeout {
  let timer: NodeJS.Timeout;
  const schedule = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    timer = setTimeout(async () => {
      await cb();
      schedule(); // 执行后调度次日
    }, delay);
  };
  schedule();
  return timer!;
}

export interface TimersDeps {
  dbPool: Pool;
}

export interface TimersHandle {
  /** 调用后清除所有定时器 */
  stop: () => void;
}

/**
 * 启动所有定时任务并返回 stop 句柄。
 * 包含：
 * 1. is_featured 每 30 分钟增量刷新
 * 2. is_active 每 10 分钟增量刷新
 * 3. 国家/机构缓存每日凌晨 5 点定时刷新
 */
export function startAllTimers(deps: TimersDeps): TimersHandle {
  const { dbPool } = deps;

  // 1. is_featured 每 30 分钟刷新
  const featuredRefreshTimer = setInterval(async () => {
    try {
      const result = await refreshFeaturedColumn(dbPool);
      if (result.changedIds.length > 0 && isMeiliHealthy()) {
        await syncNoticeIds(dbPool, result.changedIds);
      }
    } catch { /* 静默降级 */ }
  }, 30 * 60 * 1000);

  // 2. is_active 每 10 分钟刷新
  const isActiveRefreshTimer = setInterval(async () => {
    try {
      const result = await refreshIsActive(dbPool);
      await refreshNoticeStats(dbPool);
      if (result.changedIds.length > 0 && isMeiliHealthy()) {
        await syncNoticeIds(dbPool, result.changedIds);
      }
    } catch { /* 静默降级 */ }
  }, 10 * 60 * 1000);

  // 3. 国家/机构缓存每日凌晨 5 点刷新
  const dailyRefreshTimer = scheduleDailyAt(5, async () => {
    try {
      await refreshNoticeCountries(dbPool);
      await refreshNoticeAgencies(dbPool);
    } catch (e) {
      console.error("[daily-refresh] 刷新失败（静默降级）:", (e as Error).message);
    }
  });

  return {
    stop() {
      clearInterval(featuredRefreshTimer);
      clearInterval(isActiveRefreshTimer);
      clearTimeout(dailyRefreshTimer);
    },
  };
}
