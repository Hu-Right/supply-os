/**
 * 性能监控模块入口
 * Performance Monitor Entry
 *
 * @module core/perf
 * @description 统一导出性能监控工具：指标采集、报告生成、渲染计时。
 *              Unified exports for performance monitoring tools.
 */

export {
  initPerfMonitor,
  getSnapshot,
  resetMetrics,
  printSnapshot,
  recordApiMetric,
  recordRenderMetric,
  recordNavigationMetric,
  recordFirstScreen,
  markPageStart,
  markPageEnd,
} from "./metrics";

export type {
  PerfSnapshot,
  ApiMetric,
  RenderMetric,
  NavigationMetric,
  FirstScreenMetric,
} from "./metrics";

export {
  saveSnapshot,
  getSnapshots,
  getLatestPair,
  generateComparisonReport,
  generateSummaryReport,
  printReport,
} from "./reporter";

export { useRenderTimer } from "./useRenderTimer";
