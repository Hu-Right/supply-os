/**
 * 统一搜索编排器 — 索引重建触发器
 * Unified search orchestrator — index rebuild trigger
 *
 * @module server/services/search-orchestrator/rebuild-trigger
 * @description MySQL 降级期间可能有数据变更未入索引，降级发生时标记重建需求；
 *              Meilisearch 恢复健康后由 searchSync 定时循环调用 tryRunPendingRebuild
 *              自动执行全量重建。对应重构方案 §5.3。
 */
import "server-only";
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
    // 失败保留标记，下个周期重试
    _rebuildRequested = true;
    console.warn(`[meilisearch] 全量重建失败（下次重试）:`, (err as Error).message);
  } finally {
    _rebuilding = false;
  }
}
