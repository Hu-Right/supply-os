/**
 * 统一搜索编排器 — 结构化日志与降级指标
 * Unified search orchestrator — structured logging & degrade metrics
 *
 * @module server/services/search-orchestrator/metrics
 * @description [search-perf] 结构化日志 + 降级计数器 + 连续降级熔断告警。
 *              对应重构方案 §6.2/§6.3。
 */
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

/** 输出 [search-perf] 结构化日志（当前已静默，不打印到终端） */
export function logPerf(_entry: PerfLogEntry): void {
  // 结构化日志已关闭终端输出，避免大量搜索请求刷屏。
  // 如需重新启用，取消下方注释即可。
  // console.log(
  //   `[search-perf] mode=${_entry.mode} path=${_entry.path}` +
  //   ` q="${_entry.q}" filters="${_entry.filterDigest}"` +
  //   ` meili_ms=${_entry.meiliMs} detail_ms=${_entry.detailMs} total_ms=${_entry.totalMs}` +
  //   ` total=${_entry.total} ids=${_entry.ids} page=${_entry.page} cache=${_entry.cache}`,
  // );
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
