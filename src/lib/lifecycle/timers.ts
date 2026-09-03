/**
 * 启动定时器管理
 * Centralized timer management for periodic background tasks
 *
 * @module server/lifecycle/timers
 * @description 将所有定时任务（is_featured 刷新、国家/机构缓存刷新）
 *              集中管理，返回统一的 stop 函数。
 */
import type { Pool } from "mysql2/promise";
import { refreshFeaturedColumn } from "../services/notices/index";
import { refreshNoticeStats, refreshNoticeCountries, refreshNoticeAgencies } from "../services/notice-search/index";
import { syncNoticeIds, isHealthy as isMeiliHealthy } from "../services/meilisearch/index";
import { syncWideIds } from "../services/search-sync/index";
import { cleanupStaleNoticeBridge } from "../services/data-cleanup";
import { cleanupStaleNoticeData } from "../services/data-cleanup";

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
 * 2. 统计表每 10 分钟刷新
 * 3. 国家/机构缓存每日凌晨 5 点定时刷新
 * 4. 桥接表脏数据定时清理（默认每 24 小时；启动时立即异步清理一次存量）
 * 5. 附属数据（翻译表 + 宽表）脏数据定时清理（默认每 24 小时；启动时立即异步清理一次存量）
 * 6. 支付维护：超时未支付订单每小时关闭 + 无生效订阅的 VIP 会员身份每日 04:30 兜底降级
 */
export function startAllTimers(deps: TimersDeps): TimersHandle {
  const { dbPool } = deps;

  // 1. is_featured 每 30 分钟刷新
  const featuredRefreshTimer = setInterval(async () => {
    try {
      const result = await refreshFeaturedColumn(dbPool);
      if (result.changedIds.length > 0) {
        // 同步宽表（is_featured 列）
        void syncWideIds(dbPool, result.changedIds).catch(() => {});
        // 同步 Meilisearch 索引
        if (isMeiliHealthy()) {
          await syncNoticeIds(dbPool, result.changedIds);
        }
      }
    } catch { /* 静默降级 */ }
  }, 30 * 60 * 1000);

  // 2. 统计表每 10 分钟刷新（替代原 is_active 刷新，只更新统计数字）
  const statsRefreshTimer = setInterval(async () => {
    try {
      await refreshNoticeStats(dbPool);
    } catch (e) {
      console.error("[stats-timer] 刷新失败:", (e as Error).message);
    }
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

  // 4. 桥接表脏数据定时清理（BRIDGE_CLEANUP_INTERVAL_HOURS 控制间隔，默认 24 小时；
  //    BRIDGE_CLEANUP_ENABLED=off 关闭；单次失败仅记日志，不影响下一次扫描）
  let bridgeCleanupTimer: NodeJS.Timeout | null = null;
  if (String(process.env.BRIDGE_CLEANUP_ENABLED ?? "on").toLowerCase() !== "off") {
    const bridgeCleanupIntervalHours = Math.max(1, Number(process.env.BRIDGE_CLEANUP_INTERVAL_HOURS || 24));
    const runBridgeCleanup = async () => {
      try {
        await cleanupStaleNoticeBridge(dbPool);
      } catch (e) {
        console.error("[bridge-cleanup-timer] 扫描失败（不影响下次扫描）:", (e as Error).message);
      }
    };
    // 启动时立即异步清理一次存量脏数据（不阻塞启动）
    void runBridgeCleanup();
    bridgeCleanupTimer = setInterval(() => {
      void runBridgeCleanup();
    }, bridgeCleanupIntervalHours * 3600 * 1000);
  }

  // 5. 附属数据（翻译表 + 宽表）定时清理（DATA_CLEANUP_INTERVAL_HOURS 控制间隔，默认 24 小时；
  //    DATA_CLEANUP_ENABLED=off 关闭；单次失败仅记日志，不影响下一次扫描；
  //    DATA_CLEANUP_INCLUDE_EXPIRED=on 时同时清理过期公告（is_expired=1）的附属数据，
  //    默认关闭仅清"主表不存在"的死数据，与桥接表清理口径一致）
  let dataCleanupTimer: NodeJS.Timeout | null = null;
  if (String(process.env.DATA_CLEANUP_ENABLED ?? "on").toLowerCase() !== "off") {
    const dataCleanupIntervalHours = Math.max(1, Number(process.env.DATA_CLEANUP_INTERVAL_HOURS || 24));
    const includeExpired = String(process.env.DATA_CLEANUP_INCLUDE_EXPIRED ?? "off").toLowerCase() === "on";
    const runDataCleanup = async () => {
      try {
        await cleanupStaleNoticeData(dbPool, "translations", { includeExpired });
        await cleanupStaleNoticeData(dbPool, "wide", { includeExpired });
      } catch (e) {
        console.error("[data-cleanup-timer] 扫描失败（不影响下次扫描）:", (e as Error).message);
      }
    };
    // 启动时立即异步清理一次存量脏数据（不阻塞启动）
    void runDataCleanup();
    dataCleanupTimer = setInterval(() => {
      void runDataCleanup();
    }, dataCleanupIntervalHours * 3600 * 1000);
  }

  // 6. 支付维护（payment-maintenance）：
  //    a) 超时未支付订单每 60 分钟关闭一次（支付宝侧 timeout_express 30 分钟，DB 侧延后 2 小时兜底），
  //       避免 pending 订单永久滞留；PAYMENT_MAINTENANCE_ENABLED=off 关闭
  //    b) 会员身份兜底降级：每日 04:30 将"已无生效订阅"的 VIP 用户 membership_tier 回落为 free
  //       （线上身份以 resolveMembershipState 实时计算为准，此任务仅消除落库列的滞后）
  let paymentMaintenanceTimer: NodeJS.Timeout | null = null;
  let paymentTierSyncTimer: NodeJS.Timeout | null = null;
  if (String(process.env.PAYMENT_MAINTENANCE_ENABLED ?? "on").toLowerCase() !== "off") {
    const closeStalePendingOrders = async () => {
      try {
        const [ret] = await dbPool.query(
          `UPDATE crm_payment_orders SET status = 'closed'
           WHERE status = 'pending' AND created_at < NOW() - INTERVAL 2 HOUR`,
        );
        const affected = (ret as { affectedRows?: number }).affectedRows ?? 0;
        if (affected > 0) console.log(`[payment-maintenance] 已关闭 ${affected} 笔超时未支付订单`);
      } catch (e) {
        console.error("[payment-maintenance] 关闭超时订单失败（不影响下次扫描）:", (e as Error).message);
      }
    };
    const demoteExpiredVipTier = async () => {
      try {
        const [ret] = await dbPool.query(
          `UPDATE crm_users u
           SET u.membership_tier = 'free'
           WHERE u.membership_tier = 'vip'
             AND NOT EXISTS (
               SELECT 1 FROM crm_user_subscriptions s
               WHERE s.user_id = u.id
                 AND s.status = 'active'
                 AND (s.expires_at IS NULL OR s.expires_at > NOW())
             )`,
        );
        const affected = (ret as { affectedRows?: number }).affectedRows ?? 0;
        if (affected > 0) console.log(`[payment-maintenance] 已将 ${affected} 名无生效订阅的 VIP 用户降级为 free`);
      } catch (e) {
        console.error("[payment-maintenance] 会员身份兜底降级失败:", (e as Error).message);
      }
    };
    // 启动时立即异步处理一次存量（不阻塞启动）
    void closeStalePendingOrders();
    void demoteExpiredVipTier();
    paymentMaintenanceTimer = setInterval(() => {
      void closeStalePendingOrders();
    }, 60 * 60 * 1000);
    paymentTierSyncTimer = scheduleDailyAt(4, async () => {
      await demoteExpiredVipTier();
    });
  }

  return {
    stop() {
      clearInterval(featuredRefreshTimer);
      clearInterval(statsRefreshTimer);
      clearTimeout(dailyRefreshTimer);
      if (bridgeCleanupTimer) clearInterval(bridgeCleanupTimer);
      if (dataCleanupTimer) clearInterval(dataCleanupTimer);
      if (paymentMaintenanceTimer) clearInterval(paymentMaintenanceTimer);
      if (paymentTierSyncTimer) clearTimeout(paymentTierSyncTimer);
    },
  };
}
