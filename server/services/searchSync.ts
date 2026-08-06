/**
 * Meilisearch 增量同步服务
 * Meilisearch incremental sync service
 *
 * @module server/services/searchSync
 * @description 启动时异步全量同步（不阻塞启动），之后每 1 分钟增量同步。
 *              同步失败时静默降级，不影响主服务运行。
 */
import type { Pool } from "mysql2/promise";
import { fullSync, incrementalSync } from "./meilisearch";

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
  let watermark = 0;
  let stopped = false;

  // 首次全量同步（异步，不阻塞启动）
  void fullSync(pool).then((result) => {
    if (stopped) return;
    watermark = result.lastId;
    if (result.synced > 0) {
      console.log(`[meilisearch] 全量同步完成: ${result.synced} 条, watermark=${watermark}`);
    }
  });

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

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
