/**
 * Meilisearch 增量同步服务
 * Meilisearch incremental sync service
 *
 * @module server/services/searchSync
 * @description 启动时从 Meilisearch 恢复 watermark，仅在有数据缺口时执行全量同步。
 *              之后每 1 分钟增量同步。同步失败时静默降级，不影响主服务运行。
 */
import type { Pool } from "mysql2/promise";
import { fullSync, incrementalSync, getLastSyncedId, getDocCount } from "./meilisearch";

export interface SyncOptions {
  /** 增量同步间隔（毫秒），默认 1 分钟 */
  intervalMs?: number;
}

/**
 * 启动 Meilisearch 同步服务
 * @returns 停止函数（调用后清除定时器）
 */
export function startSearchSync(pool: Pool, options: SyncOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? 1 * 60 * 1000; // 默认 1 分钟
  let stopped = false;

  // 启动初始化：从 Meilisearch 恢复 watermark，避免重复全量同步
  void initWatermark().then(({ watermark, docCount }) => {
    if (stopped) return;
    console.log(`[meilisearch] 启动同步: 已有 ${docCount} 文档, watermark=${watermark}`);

    if (docCount === 0) {
      // Meilisearch 为空：执行全量同步
      void fullSync(pool).then((result) => {
        if (stopped) return;
        if (result.synced > 0) {
          console.log(`[meilisearch] 全量同步完成: ${result.synced} 条, watermark=${result.lastId}`);
          watermark = result.lastId;
        }
      });
    }
    // else: Meilisearch 已有数据，watermark 已恢复，仅靠增量同步保持最新

    // 定时增量同步
    const timer = setInterval(async () => {
      if (stopped) return;
      try {
        const { synced, newWatermark } = await incrementalSync(pool, watermark);
        if (synced > 0) {
          console.log(`[meilisearch] 增量同步: ${synced} 条 (watermark ${watermark} → ${newWatermark})`);
        }
        watermark = newWatermark;
      } catch (err) {
        // 静默降级，不影响主服务
        console.warn("[meilisearch] 增量同步异常（静默降级）:", (err as Error).message);
      }
    }, intervalMs);

    // 将 timer 挂到 stop 回调上（通过闭包捕获）
    stopFns.push(() => clearInterval(timer));
  });

  return () => {
    stopped = true;
    stopFns.forEach((fn) => fn());
    stopFns.length = 0;
  };
}

const stopFns: Array<() => void> = [];

/**
 * 从 Meilisearch 恢复 watermark（已同步的最大 ID）
 */
async function initWatermark(): Promise<{ watermark: number; docCount: number }> {
  const [lastId, docCount] = await Promise.all([getLastSyncedId(), getDocCount()]);
  return { watermark: lastId, docCount };
}
