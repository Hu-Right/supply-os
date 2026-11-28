/**
 * 服务表 → 搜索索引 同步调度（宽表退役后的唯一同步回路）
 *
 * @module lib/services/search-sync/sync-scheduler
 * @description 2026-11-28：宽表退役。同步回路从「主表 → 服务表 → 宽表 → Meili」
 *              收敛为「主表/译文 → 服务表 → Meili」：
 *
 *              1. 增量（默认 30s）：`rebuildNoticePublicChanged` 重建服务表，
 *                 再把本轮重建的 id 交给 `syncNoticeIds` 更新索引（宽表那一跳已删除）；
 *              2. 对账（默认 10min）：平台公告状态漂移（发布/下架）按同一回路补齐。
 *
 *              节流在 `rebuildNoticePublicChanged` 内部（默认 10 分钟窗口），
 *              定时器只是「到点敲门」，不会造成全表重算。
 */
import type { Pool } from "mysql2/promise";
import { rebuildNoticePublicChanged } from "../notice-public/rebuild";
import { detectPlatformStatusDrift } from "../notice-public/platform-drift";
import { deletePublicRows } from "../notice-public/build";
import { syncNoticeIds } from "../meilisearch";
import { purgeNoticeSearch } from "../search-visibility/purge";

export interface PublicSyncOptions {
  /** 增量重建间隔（毫秒），默认 30 秒（实际执行受 rebuild 内部节流窗口约束） */
  intervalMs?: number;
  /** 平台状态对账间隔（毫秒），默认 10 分钟 */
  reconcileIntervalMs?: number;
}

/**
 * 启动服务表/索引同步调度。
 * @returns 停止函数
 */
export function startPublicSync(pool: Pool, options: PublicSyncOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? 30 * 1000;
  const reconcileIntervalMs = options.reconcileIntervalMs ?? 10 * 60 * 1000;
  let stopped = false;
  let reconciling = false;
  const stopFns: Array<() => void> = [];

  // 定时器 1：服务表增量重建 → 按 id 同步索引
  const incremental = setInterval(async () => {
    if (stopped) return;
    try {
      const result = await rebuildNoticePublicChanged(pool);
      if (stopped || result.ids.length === 0) return;
      await syncNoticeIds(pool, result.ids).catch((err: unknown) => {
        console.warn("[public-sync] 索引增量同步失败（下轮对账兜底）:", (err as Error).message);
      });
    } catch (err) {
      console.warn("[public-sync] 服务表增量重建异常（下轮再试）:", (err as Error).message);
    }
  }, intervalMs);
  stopFns.push(() => clearInterval(incremental));

  // 定时器 2：平台公告状态漂移（发布 / 下架）
  const reconcile = setInterval(async () => {
    if (stopped || reconciling) return;
    reconciling = true;
    try {
      const drift = await detectPlatformStatusDrift(pool);
      if (drift.toPurge.length > 0) {
        await deletePublicRows(pool, drift.toPurge);
        await purgeNoticeSearch(pool, drift.toPurge);
      }
      if (drift.toSync.length > 0) {
        const result = await rebuildNoticePublicChanged(pool, { force: true });
        const ids = result.ids.length > 0 ? result.ids : drift.toSync;
        await syncNoticeIds(pool, ids);
      }
      if (drift.toPurge.length > 0 || drift.toSync.length > 0) {
        console.log(
          `[public-sync] 平台公告对账：补建=${drift.toSync.length} · 下架=${drift.toPurge.length}`,
        );
      }
    } catch (err) {
      console.warn("[public-sync] 平台公告对账异常（下轮再试）:", (err as Error).message);
    } finally {
      reconciling = false;
    }
  }, reconcileIntervalMs);
  stopFns.push(() => clearInterval(reconcile));

  return () => {
    stopped = true;
    stopFns.forEach((fn) => fn());
    stopFns.length = 0;
  };
}
