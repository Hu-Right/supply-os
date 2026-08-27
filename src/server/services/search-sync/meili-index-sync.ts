/**
 * Meilisearch 增量同步服务
 * Meilisearch incremental sync service
 *
 * @module server/services/search-sync/meili-index-sync
 * @description 启动时从 Meilisearch 恢复 watermark，仅在有数据缺口时执行全量同步。
 *              之后每 1 分钟增量同步。同步失败时静默降级，不影响主服务运行。
 *              （#8 整理，2026-08-20：自顶层 searchSync.ts 迁入 search-sync 域，
 *              消除 searchSync / search-sync 命名混淆；逻辑零变更。
 *              本文件负责流水线第二段：宽表 → Meili 索引；
 *              第一段 MySQL → 宽表由 sync-scheduler.ts 承担）
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { fullSync, incrementalSync, getLastSyncedId, getDocCount, hasHasDeadlineField } from "../meilisearch";
import { getWideTableCount } from "../meilisearch/sync";
import { isHealthy, tryRecover } from "../meilisearch/client";
import { tryRunPendingRebuild, requestIndexRebuild } from "../search-orchestrator/rebuild-trigger";

export interface SyncOptions {
  /** 增量同步间隔（毫秒），默认 1 分钟 */
  intervalMs?: number;
}

/**
 * 启动 Meilisearch 同步服务
 * @returns 停止函数（调用后清除定时器）
 */
export function startSearchSync(pool: Pool, options: SyncOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? 30 * 1000; // 默认 30 秒
  let stopped = false;
  // P2-8 修复：stopFns 移入闭包内部，多次调用 startSearchSync 不会累积
  const stopFns: Array<() => void> = [];
  let watermark = 0;
  let initialized = false;
  // 降级演练修复：setInterval 回调不串行，init() 长耗时（fullSync 数分钟）期间
  // 后续 tick 会重入初始化，导致多个 fullSync 并发互相清空索引；加重入守卫
  let initializing = false;
  // 覆盖率对账计数器：每 10 轮增量同步后检查一次索引覆盖率
  let syncCount = 0;

  /**
   * 启动初始化：从 Meilisearch 恢复 watermark，避免重复全量同步。
   * 降级演练修复：服务启动时若 Meilisearch 宕机，原实现会因 Promise reject
   * 直接落入 catch，导致定时器永不创建、重建任务永不调度；
   * 现改由定时循环重试初始化，Meilisearch 恢复后自动接管。
   */
  async function init(): Promise<void> {
    const { watermark: wm, docCount } = await initWatermark();
    if (stopped) return;
    watermark = wm;

    if (docCount === 0) {
      // Meilisearch 为空：执行全量同步
      const result = await fullSync(pool);
      if (!stopped) watermark = result.lastId;
    } else {
      // 索引健康检测：检查旧哨兵值 + ghost IDs（MySQL 已删除但索引中仍存在的文档）
      const issues = await detectIndexIssues(pool);
      if (issues.length > 0 && !stopped) {
        console.warn(`[meilisearch] 检测到索引问题: ${issues.join(", ")}，触发全量重建...`);
        const result = await fullSync(pool);
        if (!stopped) watermark = result.lastId;
      }
    }
    initialized = true;
  }

  // 定时器无条件创建：先尝试初始化（失败下轮重试），成功后进入增量同步 + 待处理重建检查
  const timer = setInterval(async () => {
    if (stopped) return;
    if (!initialized) {
      if (initializing) return; // 上一轮初始化（可能含 fullSync）尚未完成，跳过
      initializing = true;
      try {
        await init();
      } catch (err) {
        console.warn("[meilisearch] 同步初始化失败（Meilisearch 不可用，下次重试）:", (err as Error).message);
      } finally {
        initializing = false;
      }
      return;
    }
    // 降级演练修复：无搜索流量时健康状态只能靠查询路径探测，导致恢复后
    // 重建永久阻塞；同步循环每轮主动探测一次（带 10s 冷却，开销可忽）
    if (!isHealthy()) {
      await tryRecover().catch(() => false);
    }
    try {
      const { newWatermark } = await incrementalSync(pool, watermark);
      watermark = newWatermark;
    } catch (err) {
      // 静默降级，不影响主服务
      console.warn("[meilisearch] 增量同步异常（静默降级）:", (err as Error).message);
    }
    // 覆盖率对账：每 20 轮增量同步后检查 Meilisearch 文档数与宽表行数的比值，
    // 差距超过 5% 时主动触发全量重建，防止索引长期不完整导致"数据库有但搜不到"
    // （同步间隔 5s × 20 轮 = ~100s 检查一次，与旧 10s × 10 轮频率一致）
    syncCount++;
    if (initialized && syncCount % 20 === 0 && isHealthy()) {
      try {
        const [meiliCount, wideCount] = await Promise.all([getDocCount(), getWideTableCount(pool)]);
        if (wideCount > 0 && meiliCount < wideCount * 0.95) {
          const pct = (meiliCount / wideCount * 100).toFixed(1);
          console.warn(`[meilisearch] 索引覆盖率不足: Meilisearch=${meiliCount} / 宽表=${wideCount} (${pct}%)，触发全量重建`);
          requestIndexRebuild("coverage-gap");
        }
      } catch {
        // 查询失败静默忽略，下轮再试
      }
    }
    // 重建触发器：仅当 Meilisearch 健康且有待处理重建时执行
    try {
      await tryRunPendingRebuild(pool);
      if (!stopped) {
        // 重建后刷新 watermark，避免重建后的增量重复
        const { watermark: freshWatermark } = await initWatermark();
        if (freshWatermark > watermark) watermark = freshWatermark;
      }
    } catch (err) {
      console.warn("[meilisearch] 重建检查异常（静默降级）:", (err as Error).message);
    }
  }, intervalMs);

  stopFns.push(() => clearInterval(timer));

  return () => {
    stopped = true;
    stopFns.forEach((fn) => fn());
    stopFns.length = 0;
  };
}

/**
 * 从 Meilisearch 恢复 watermark（已同步的最大 ID）
 */
async function initWatermark(): Promise<{ watermark: number; docCount: number }> {
  const [lastId, docCount] = await Promise.all([getLastSyncedId(), getDocCount()]);
  return { watermark: lastId, docCount };
}

/** 检测 Meilisearch 索引中的问题：ghost IDs + 缺少 has_deadline 字段 */
async function detectIndexIssues(pool: Pool): Promise<string[]> {
  const issues: string[] = [];

  // [修复 030-c] 移除旧哨兵值检测（hasOldSentinel）。
  // 迁移 030 已将宽表 deadline_sec 扩容为 BIGINT UNSIGNED，
  // 合法的远期截止日期（如 32503478400 ≈ 公元 3000 年）会超过旧阈值 9999999999，
  // 导致每次重启都误判为"旧哨兵值"并触发不必要的全量重建。

  // 检测 has_deadline 字段缺失（排序修复后新增的字段，旧索引需要全量重建）
  const hasDeadlineField = await hasHasDeadlineField();
  if (!hasDeadlineField) issues.push("缺少 has_deadline 字段");

  // 检测 ghost IDs：索引文档数应等于宽表行数（索引同步的事实源）。
  // 注：不能用 crm_bid_notices 总行数作基线——该表在外部迁移时会被临时清空，
  // 误触发全量重建（回归演练期间实测多次重建）
  const [meiliCount, wideCount] = await Promise.all([getDocCount(), getWideTableCount(pool)]);
  if (meiliCount > wideCount * 1.01) {
    // 允许 1% 的误差（增量同步延迟等）
    issues.push(`ghost IDs (Meilisearch=${meiliCount} > 宽表=${wideCount})`);
  }

  return issues;
}
