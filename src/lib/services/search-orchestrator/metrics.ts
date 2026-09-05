/**
 * 搜索编排器指标 — 向后兼容 re-export
 * @deprecated 权威实现已迁至 search-common/metrics，新代码应从 @/lib/services/search-common/metrics 导入
 */
export { logPerf, recordFallback, logSyncCascade } from "../search-common/metrics";
export type { PerfLogEntry } from "../search-common/metrics";
