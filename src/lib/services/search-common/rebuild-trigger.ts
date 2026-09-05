/**
 * 搜索公共层 — 索引重建触发器
 * Search Common — index rebuild trigger
 *
 * @module lib/services/search-common/rebuild-trigger
 * @description ARCH-P3-解环（2026-09-05）：从 search-orchestrator/rebuild-trigger 迁出，
 *              打断 search-sync ↔ search-orchestrator 双向依赖环。
 *              原位置保留 re-export 兼容存量导入。
 */
import type { Pool } from "mysql2/promise";
import { fullSync, isHealthy } from "../meilisearch/index";

let _rebuildRequested = false;
let _rebuildReason = "";
let _rebuilding = false;

/** 标记需要全量重建（降级路径触发） */
export function requestIndexRebuild(reason: string): void {
  if (_rebuildRequested) return;
  _rebuildRequested = true;
  _rebuildReason = reason;
  console.warn(`[search-degrade] 索引重建已标记: reason=${reason}`);
}

/** 是否有待处理的重建请求 */
export function isRebuildRequested(): boolean {
  return _rebuildRequested;
}

/**
 * 尝试执行待处理的重建（由 searchSync 定时循环调用）。
 * 仅当 Meilisearch 健康且无并发重建时执行；失败保留标记下次重试。
 */
export async function tryRunPendingRebuild(pool: Pool): Promise<void> {
  if (!_rebuildRequested || _rebuilding) return;
  if (!isHealthy()) return;

  _rebuilding = true;
  _rebuildRequested = false;
  const reason = _rebuildReason;
  try {
    console.log(`[meilisearch] 执行待处理的全量重建: reason=${reason}`);
    const result = await fullSync(pool);
    console.log(`[meilisearch] 全量重建完成: ${result.synced} 条文档, ${result.elapsed}ms`);
  } catch (err) {
    _rebuildRequested = true;
    console.warn(`[meilisearch] 全量重建失败（下次重试）:`, (err as Error).message);
  } finally {
    _rebuilding = false;
  }
}
