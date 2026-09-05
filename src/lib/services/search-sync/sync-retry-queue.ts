/**
 * Meilisearch 级联同步重试队列
 * Meilisearch cascade sync retry queue
 *
 * @module server/services/search-sync/sync-retry-queue
 * @description 宽表 → Meilisearch 级联同步失败时，ID 进入重试队列；
 *              每 5 分钟批量重试，最多 3 次后放弃（等待定时全量对账兜底）。
 *              对应重构方案 §5.2。
 */
import type { Pool } from "mysql2/promise";
import { syncNoticeIds, isHealthy } from "../meilisearch/index";
import { tryRecover } from "../meilisearch/client";
import { logSyncCascade } from "../search-common/metrics";

interface RetryEntry {
  id: number;
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 200;

const _queue = new Map<number, RetryEntry>();
let _timer: ReturnType<typeof setInterval> | null = null;
let _processing = false;

/** 级联同步失败的 ID 入队 */
export function enqueueRetry(ids: number[]): void {
  for (const id of ids) {
    if (!Number.isFinite(id) || id <= 0) continue;
    const existing = _queue.get(id);
    _queue.set(id, existing ? { id, attempts: existing.attempts } : { id, attempts: 0 });
  }
  logSyncCascade("meili", ids.length, "retry");
}

/** 处理一轮重试 */
async function processRetries(pool: Pool): Promise<void> {
  // 修复 G2：不再在 Meilisearch 不健康时直接返回（丢弃队列条目），
  // 改为尝试 tryRecover 自愈，恢复失败则保留条目等待下轮重试。
  if (_processing || _queue.size === 0) return;
  _processing = true;
  try {
    // 不健康时尝试恢复
    if (!isHealthy()) {
      const recovered = await tryRecover().catch(() => false);
      if (!recovered) {
        // 保留队列条目，下轮重试
        logSyncCascade("meili", _queue.size, "retry");
        return;
      }
    }
    const entries = Array.from(_queue.values()).slice(0, BATCH_SIZE);
    const ids = entries.map((e) => e.id);
    for (const id of ids) _queue.delete(id);

    try {
      const { synced, deleted } = await syncNoticeIds(pool, ids);
      const processed = synced + deleted;
      if (processed > 0) logSyncCascade("meili", processed, "ok");
      // 未同步成功的 ID（宽表缺行等）重新入队；已从索引删除的 ghost ID 视为已处理
      const remaining = entries.filter((e) => e.attempts + 1 < MAX_ATTEMPTS);
      for (const e of remaining) {
        // syncNoticeIds 无法区分单条成败，保守按批次结果处理：processed < ids.length 时全部重试
        if (processed < ids.length) _queue.set(e.id, { id: e.id, attempts: e.attempts + 1 });
      }
    } catch (err) {
      // 本批失败：未超次数的重新入队
      for (const e of entries) {
        if (e.attempts + 1 < MAX_ATTEMPTS) _queue.set(e.id, { id: e.id, attempts: e.attempts + 1 });
      }
      console.warn(`[sync-retry] 重试批次失败: ${(err as Error).message}`);
    }
  } finally {
    _processing = false;
  }
}

/** 启动重试队列定时器（由 bootstrap 调用），返回停止函数 */
export function startSyncRetryQueue(pool: Pool): () => void {
  if (_timer) return () => undefined;
  _timer = setInterval(() => {
    void processRetries(pool);
  }, RETRY_INTERVAL_MS);
  return () => {
    if (_timer) clearInterval(_timer);
    _timer = null;
    _queue.clear();
  };
}

/** 当前队列长度（监控用） */
export function getRetryQueueSize(): number {
  return _queue.size;
}
