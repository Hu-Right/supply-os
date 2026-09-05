/**
 * 搜索公共指标层 — 结构化日志与降级指标
 * Search Common — structured logging & degrade metrics
 *
 * @module lib/services/search-common/metrics
 * @description ARCH-P3-解环（2026-09-05）：从 search-orchestrator/metrics 迁出，
 *              作为 search-sync 与 search-orchestrator 的共享叶子模块，
 *              打断双向依赖环。
 *
 *              原位置保留 re-export 兼容存量导入。
 */
import type { SearchMode, SearchPath } from "../search-orchestrator/types";

export interface PerfLogEntry {
  mode: SearchMode;
  path: SearchPath;
  q: string;
  filterDigest: string;
  meiliMs: number;
  detailMs: number;
  totalMs: number;
  total: number;
  ids: number;
  page: number;
  cache: "hit" | "miss";
}

/**
 * B5 优化：输出 [search-perf] 结构化日志（1/10 采样，避免刷屏）。
 * 缓存命中请求不输出（cache=hit 时直接 return），仅采样缓存未命中的真实请求。
 */
let _perfCounter = 0;
export function logPerf(entry: PerfLogEntry): void {
  if (entry.cache === "hit") return;
  if (++_perfCounter % 10 !== 0) return;
  console.log(
    `[search-perf] mode=${entry.mode} path=${entry.path}` +
    ` q="${entry.q}" filters="${entry.filterDigest}"` +
    ` meili_ms=${entry.meiliMs} detail_ms=${entry.detailMs} total_ms=${entry.totalMs}` +
    ` total=${entry.total} ids=${entry.ids} page=${entry.page} cache=${entry.cache}`,
  );
}

// ── 降级计数器（1 分钟滑动窗口，熔断阈值 10 次）──
const CIRCUIT_WINDOW_MS = 60 * 1000;
const CIRCUIT_THRESHOLD = 10;
let _fallbackTimestamps: number[] = [];

/** 记录一次 MySQL 降级事件；触发熔断时输出 ERROR 级告警 */
export function recordFallback(reason: string): void {
  const now = Date.now();
  _fallbackTimestamps = _fallbackTimestamps.filter((ts) => now - ts < CIRCUIT_WINDOW_MS);
  _fallbackTimestamps.push(now);
  console.warn(`[search-degrade] reason=${reason} count_1min=${_fallbackTimestamps.length}`);
  if (_fallbackTimestamps.length === CIRCUIT_THRESHOLD) {
    console.error(
      `[search-degrade] CIRCUIT_BREAKER: ${CIRCUIT_THRESHOLD} 次降级/分钟，` +
      `Meilisearch 持续异常，请检查服务状态（reason=${reason}）`,
    );
  }
}

/** 记录同步级联事件（宽表 → Meilisearch），1/10 采样避免刷屏 */
let _syncCascadeCounter = 0;
export function logSyncCascade(stage: "wide" | "meili", ids: number, status: "ok" | "fail" | "retry"): void {
  if (status === "ok" && ++_syncCascadeCounter % 10 !== 0) return;
  console.log(`[sync-cascade] stage=${stage} ids=${ids} status=${status}`);
}
