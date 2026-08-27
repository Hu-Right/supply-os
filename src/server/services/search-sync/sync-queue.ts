/**
 * 宽表同步队列
 * Wide Table Sync Queue
 *
 * @module server/services/search-sync/sync-queue
 * @description 统一调度按 ID 同步请求，避免多路径并发写入同一行产生竞态。
 *              调用方通过 enqueue(ids) 入队，队列定时批量处理（去重+合并）。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { syncWideIds } from "./sync-scheduler";

// 同步队列（Set 自动去重）
const _syncQueue = new Set<number>();
let _processing = false;
let _processTimer: ReturnType<typeof setTimeout> | null = null;
let _poolRef: Pool | null = null;

// 配置
const PROCESS_INTERVAL_MS = 500; // 500ms 批量处理一次
const BATCH_SIZE = 100; // 每批最多处理 100 个 ID

/**
 * 将 ID 加入同步队列
 * 队列会在 500ms 后批量处理（去重+合并）
 */
export function enqueue(pool: Pool, ids: number[]): void {
  _poolRef = pool;
  for (const id of ids) {
    if (Number.isFinite(id) && id > 0) {
      _syncQueue.add(id);
    }
  }
  // 触发延迟处理
  scheduleProcess();
}

/**
 * 调度队列处理（防抖）
 */
function scheduleProcess(): void {
  if (_processTimer || !_poolRef) return;
  _processTimer = setTimeout(() => {
    _processTimer = null;
    if (_poolRef) void processQueue(_poolRef);
  }, PROCESS_INTERVAL_MS);
}

/**
 * 批量处理队列中的 ID
 * 去重后调用 syncWideIds 同步
 */
export async function processQueue(pool: Pool): Promise<{ synced: number }> {
  if (_processing || _syncQueue.size === 0) {
    return { synced: 0 };
  }

  _processing = true;
  try {
    // 取出当前队列（最多 BATCH_SIZE 个）
    const ids = Array.from(_syncQueue).slice(0, BATCH_SIZE);
    // 从队列中移除已取出的 ID
    for (const id of ids) {
      _syncQueue.delete(id);
    }

    if (ids.length === 0) {
      return { synced: 0 };
    }

    // 批量同步
    const result = await syncWideIds(pool, ids);

    // 如果队列还有剩余，继续调度
    if (_syncQueue.size > 0) {
      scheduleProcess();
    }

    return result;
  } catch (err) {
    console.warn("[sync-queue] 队列处理失败:", (err as Error).message);
    return { synced: 0 };
  } finally {
    _processing = false;
  }
}

/**
 * 清空队列（全量/增量同步完成后调用）
 */
export function clearQueue(): void {
  _syncQueue.clear();
  if (_processTimer) {
    clearTimeout(_processTimer);
    _processTimer = null;
  }
}

/**
 * 获取队列长度（测试/监控用）
 */
export function getQueueSize(): number {
  return _syncQueue.size;
}

/**
 * 启动队列自动处理定时器
 * 返回停止函数
 */
export function startQueueProcessor(pool: Pool): () => void {
  const timer = setInterval(() => {
    if (_syncQueue.size > 0 && !_processing) {
      void processQueue(pool);
    }
  }, PROCESS_INTERVAL_MS);

  return () => {
    clearInterval(timer);
    clearQueue();
  };
}
