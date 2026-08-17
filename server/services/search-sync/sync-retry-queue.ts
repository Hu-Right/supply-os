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
import { logSyncCascade } from "../search-orchestrator/metrics";

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
  if (_processing || _queue.size === 0 || !isHealthy()) return;
  _processing = true;
  try {
    const entries = Array.from(_queue.values()).slice(0, BATCH_SIZE);
    const ids = entries.map((e) => e.id);
    for (const id of ids) _queue.delete(id);

    try {
      const { synced } = await syncNoticeIds(pool, ids);
      if (synced > 0) logSyncCascade("meili", synced, "ok");
      // 未同步成功的 ID（宽表缺行等）重新入队
      const remaining = entries.filter((e) => e.attempts + 1 < MAX_ATTEMPTS);
      for (const e of remaining) {
        // syncNoticeIds 无法区分单条成败，保守按批次结果处理：synced < ids.length 时全部重试
        if (synced < ids.length) _queue.set(e.id, { id: e.id, attempts: e.attempts + 1 });
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
