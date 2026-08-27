/**
 * 统一搜索编排器 — 结构化日志与降级指标
 * Unified search orchestrator — structured logging & degrade metrics
 *
 * @module server/services/search-orchestrator/metrics
 * @description [search-perf] 结构化日志 + 降级计数器 + 连续降级熔断告警。
 *              对应重构方案 §6.2/§6.3。
 */
import "server-only";
import type { SearchMode, SearchPath } from "./types";

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
  // 缓存命中不输出（高频且无耗时信息价值）
  if (entry.cache === "hit") return;
  // 1/10 采样：每 10 次缓存未命中请求输出 1 次
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

/** 记录同步级联事件（宽表 → Meilisearch） */
export function logSyncCascade(stage: "wide" | "meili", ids: number, status: "ok" | "fail" | "retry"): void {
  console.log(`[sync-cascade] stage=${stage} ids=${ids} status=${status}`);
}
