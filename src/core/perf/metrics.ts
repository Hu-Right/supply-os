/**
 * 性能指标采集模块
 * Performance Metrics Collector
 *
 * @module core/perf/metrics
 * @description 统一采集首屏加载时间、API 响应时间、组件渲染时间等性能指标。
 *              所有指标存储在模块级 Map 中，通过 getSnapshot/getReport 导出。
 *              Collects first-screen load time, API response time, component render
 *              time. All metrics stored in module-level Map, exported via snapshot.
 */

// ── 类型定义 ──

export interface ApiMetric {
  endpoint: string;
  method: string;
  durationMs: number;
  cached: boolean;
  status: number;
  timestamp: number;
}

export interface RenderMetric {
  component: string;
  renderMs: number;
  timestamp: number;
}

export interface NavigationMetric {
  name: string;
  valueMs: number;
  timestamp: number;
}

export interface FirstScreenMetric {
  page: string;
  /** 从页面挂载到数据就绪的耗时 */
  loadMs: number;
  /** 数据项数量 */
  itemCount: number;
  timestamp: number;
}

export interface PerfSnapshot {
  id: string;
  label: string;
  createdAt: string;
  userAgent: string;
  navigation: NavigationMetric[];
  api: ApiMetric[];
  renders: RenderMetric[];
  firstScreen: FirstScreenMetric[];
  summary: {
    ttfb: number | null;
    fcp: number | null;
    lcp: number | null;
    domInteractive: number | null;
    avgApiMs: number;
    slowestApi: ApiMetric | null;
    totalApiCalls: number;
    cachedApiCalls: number;
    avgRenderMs: number;
    slowestRender: RenderMetric | null;
  };
}

// ── 存储 ──

const apiMetrics: ApiMetric[] = [];
const renderMetrics: RenderMetric[] = [];
const navigationMetrics: NavigationMetric[] = [];
const firstScreenMetrics: FirstScreenMetric[] = [];

// ── 采集函数 ──

/** 记录 API 请求指标 */
export function recordApiMetric(metric: ApiMetric): void {
  apiMetrics.push(metric);
}

/** 记录组件渲染耗时 */
export function recordRenderMetric(metric: RenderMetric): void {
  renderMetrics.push(metric);
}

/** 记录导航计时（来自 PerformanceObserver 或手动标记） */
export function recordNavigationMetric(metric: NavigationMetric): void {
  navigationMetrics.push(metric);
}

/** 记录首屏加载完成 */
export function recordFirstScreen(metric: FirstScreenMetric): void {
  firstScreenMetrics.push(metric);
}

// ── 页面首屏计时工具 ──

const pageTimers = new Map<string, number>();

/** 标记页面开始加载（在组件 mount 时调用） */
export function markPageStart(page: string): void {
  pageTimers.set(page, performance.now());
}

/** 标记页面加载完成，返回耗时（毫秒） */
export function markPageEnd(page: string, itemCount: number): number {
  const start = pageTimers.get(page);
  if (start === undefined) return -1;
  const duration = performance.now() - start;
  pageTimers.delete(page);
  recordFirstScreen({ page, loadMs: Math.round(duration), itemCount, timestamp: Date.now() });
  return Math.round(duration);
}

// ── Web Vitals 采集（自动） ──

function collectNavigationMetrics(): void {
  if (typeof window === "undefined" || !window.performance?.getEntriesByType) return;

  const nav = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (nav.length > 0) {
    const entry = nav[0];
    const metrics: NavigationMetric[] = [
      { name: "ttfb", valueMs: Math.round(entry.responseStart), timestamp: Date.now() },
      { name: "domInteractive", valueMs: Math.round(entry.domInteractive), timestamp: Date.now() },
      { name: "domComplete", valueMs: Math.round(entry.domComplete), timestamp: Date.now() },
      { name: "loadEventEnd", valueMs: Math.round(entry.loadEventEnd), timestamp: Date.now() },
    ];
    metrics.forEach((m) => recordNavigationMetric(m));
  }

  // FCP / LCP 通过 PerformanceObserver 异步采集
  if ("PerformanceObserver" in window) {
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            recordNavigationMetric({
              name: "fcp",
              valueMs: Math.round(entry.startTime),
              timestamp: Date.now(),
            });
          }
        }
      });
      paintObserver.observe({ type: "paint", buffered: true });
    } catch { /* paint observer not supported */ }

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          recordNavigationMetric({
            name: "lcp",
            valueMs: Math.round(entries[entries.length - 1].startTime),
            timestamp: Date.now(),
          });
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch { /* lcp observer not supported */ }
  }
}

// ── 快照与报告 ──

function computeSummary(): PerfSnapshot["summary"] {
  const nav = navigationMetrics;
  const findNav = (name: string) => nav.find((m) => m.name === name)?.valueMs ?? null;

  const totalApi = apiMetrics.length;
  const cachedCount = apiMetrics.filter((m) => m.cached).length;
  const avgApi = totalApi > 0 ? Math.round(apiMetrics.reduce((s, m) => s + m.durationMs, 0) / totalApi) : 0;
  const slowestApi = totalApi > 0 ? apiMetrics.reduce((a, b) => (a.durationMs > b.durationMs ? a : b)) : null;

  const totalRender = renderMetrics.length;
  const avgRender = totalRender > 0 ? Math.round(renderMetrics.reduce((s, m) => s + m.renderMs, 0) / totalRender) : 0;
  const slowestRender = totalRender > 0 ? renderMetrics.reduce((a, b) => (a.renderMs > b.renderMs ? a : b)) : null;

  return {
    ttfb: findNav("ttfb"),
    fcp: findNav("fcp"),
    lcp: findNav("lcp"),
    domInteractive: findNav("domInteractive"),
    avgApiMs: avgApi,
    slowestApi,
    totalApiCalls: totalApi,
    cachedApiCalls: cachedCount,
    avgRenderMs: avgRender,
    slowestRender,
  };
}

/** 生成当前性能快照 */
export function getSnapshot(label = "default"): PerfSnapshot {
  return {
    id: `${label}_${Date.now()}`,
    label,
    createdAt: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "ssr",
    navigation: [...navigationMetrics],
    api: [...apiMetrics],
    renders: [...renderMetrics],
    firstScreen: [...firstScreenMetrics],
    summary: computeSummary(),
  };
}

/** 重置所有指标（新一轮测试前调用） */
export function resetMetrics(): void {
  apiMetrics.length = 0;
  renderMetrics.length = 0;
  navigationMetrics.length = 0;
  firstScreenMetrics.length = 0;
  pageTimers.clear();
}

/** 将快照输出到控制台（开发模式可见） */
export function printSnapshot(snapshot: PerfSnapshot): void {
  const s = snapshot.summary;
  console.group(`%c[Perf] ${snapshot.label}`, "color: #0d9488; font-weight: bold");
  console.log("TTFB:", s.ttfb != null ? `${s.ttfb}ms` : "N/A");
  console.log("FCP:", s.fcp != null ? `${s.fcp}ms` : "N/A");
  console.log("LCP:", s.lcp != null ? `${s.lcp}ms` : "N/A");
  console.log("DOM Interactive:", s.domInteractive != null ? `${s.domInteractive}ms` : "N/A");
  console.log(`API: ${s.totalApiCalls} calls, avg ${s.avgApiMs}ms, ${s.cachedApiCalls} cached`);
  if (s.slowestApi) {
    console.log(`Slowest API: ${s.slowestApi.endpoint} (${s.slowestApi.durationMs}ms)`);
  }
  console.log(`Renders: avg ${s.avgRenderMs}ms`);
  if (s.slowestRender) {
    console.log(`Slowest Render: ${s.slowestRender.component} (${s.slowestRender.renderMs}ms)`);
  }
  if (snapshot.firstScreen.length > 0) {
    console.log("First Screen:");
    snapshot.firstScreen.forEach((fs) => {
      console.log(`  ${fs.page}: ${fs.loadMs}ms (${fs.itemCount} items)`);
    });
  }
  console.groupEnd();
}

// ── 初始化 ──

let initialized = false;

/** 启动性能采集（在 main.tsx 中调用一次） */
export function initPerfMonitor(): void {
  if (initialized) return;
  initialized = true;
  collectNavigationMetrics();
}

// ── 挂载到 window 供调试使用 ──

if (typeof window !== "undefined") {
  (window as any).__perf = {
    getSnapshot,
    resetMetrics,
    printSnapshot,
    recordApiMetric,
    recordRenderMetric,
    markPageStart,
    markPageEnd,
  };
}
