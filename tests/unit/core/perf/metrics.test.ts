/**
 * core/perf/metrics 采集链路回归测试
 *
 * 背景：initPerfMonitor 曾因「Vite 迁移遗留的 main.tsx 注释」而无人调用，
 * TTFB/FCP/LCP 恒为 null（2026-10 架构评审 P0-3）。本测试钉住：
 * - initPerfMonitor 注册 paint / LCP 两个 PerformanceObserver，且幂等
 * - 导航计时在 getEntriesByType 有数据时落库
 * - 环形缓冲上限 500（F49）
 * - markPageStart/End 的首屏计时语义（未 start 返回 -1、start 后只结算一次）
 * - getSnapshot/computeSummary/resetMetrics/printSnapshot 与 window.__perf 挂载
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type MetricsModule = typeof import("@/core/perf/metrics");

async function freshImport(): Promise<MetricsModule> {
  vi.resetModules();
  return await import("@/core/perf/metrics");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("initPerfMonitor", () => {
  it("注册 FCP(paint) 与 LCP 两个 buffered PerformanceObserver，重复调用幂等", async () => {
    const observe = vi.fn();
    class MockPerformanceObserver {
      callback: PerformanceObserverCallback;
      constructor(cb: PerformanceObserverCallback) {
        this.callback = cb;
      }
      observe(options: unknown) {
        observe(options);
      }
      disconnect() {}
    }
    vi.stubGlobal("PerformanceObserver", MockPerformanceObserver);

    const m = await freshImport();
    m.initPerfMonitor();
    m.initPerfMonitor(); // 第二次必须被 initialized 门挡住

    expect(observe).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledWith({ type: "paint", buffered: true });
    expect(observe).toHaveBeenCalledWith({ type: "largest-contentful-paint", buffered: true });
  });

  it("navigation timing 有数据时把 ttfb/domInteractive 等写入快照", async () => {
    const fakeNav = {
      responseStart: 120,
      domInteractive: 400,
      domComplete: 600,
      loadEventEnd: 650,
    };
    vi.spyOn(performance, "getEntriesByType").mockImplementation((type) =>
      type === "navigation" ? ([fakeNav] as unknown as PerformanceEntryList) : [],
    );

    const m = await freshImport();
    m.initPerfMonitor();
    const snap = m.getSnapshot("nav-test");

    expect(snap.summary.ttfb).toBe(120);
    expect(snap.summary.domInteractive).toBe(400);
    expect(snap.navigation.some((n) => n.name === "domComplete" && n.valueMs === 600)).toBe(true);
  });

  it("window.__perf 调试入口在模块加载时挂载", async () => {
    await freshImport();
    expect((window as unknown as { __perf?: Record<string, unknown> }).__perf).toBeDefined();
  });
});

describe("指标存储与环形缓冲", () => {
  it("API 指标超过 500 条时丢弃最旧（F49 环形缓冲）", async () => {
    const m = await freshImport();
    for (let i = 0; i < 505; i++) {
      m.recordApiMetric({ endpoint: `/e/${i}`, method: "GET", durationMs: i, cached: false, status: 200, timestamp: i });
    }
    const snap = m.getSnapshot("cap");
    expect(snap.api.length).toBe(500);
    expect(snap.api[0].endpoint).toBe("/e/5"); // 前 5 条被挤出
  });

  it("computeSummary 汇总均值/最慢/缓存命中；空存储返回 0 与 null", async () => {
    const m = await freshImport();
    const empty = m.getSnapshot("empty");
    expect(empty.summary.avgApiMs).toBe(0);
    expect(empty.summary.slowestApi).toBeNull();
    expect(empty.summary.avgRenderMs).toBe(0);
    expect(empty.summary.slowestRender).toBeNull();

    m.recordApiMetric({ endpoint: "/slow", method: "GET", durationMs: 900, cached: false, status: 200, timestamp: 1 });
    m.recordApiMetric({ endpoint: "/fast", method: "GET", durationMs: 100, cached: true, status: 200, timestamp: 2 });
    m.recordRenderMetric({ component: "Heavy", renderMs: 30, timestamp: 1 });
    m.recordRenderMetric({ component: "Light", renderMs: 10, timestamp: 2 });

    const snap = m.getSnapshot("full");
    expect(snap.summary.totalApiCalls).toBe(2);
    expect(snap.summary.cachedApiCalls).toBe(1);
    expect(snap.summary.avgApiMs).toBe(500);
    expect(snap.summary.slowestApi?.endpoint).toBe("/slow");
    expect(snap.summary.avgRenderMs).toBe(20);
    expect(snap.summary.slowestRender?.component).toBe("Heavy");
  });

  it("resetMetrics 清空全部四类指标与页面计时器", async () => {
    const m = await freshImport();
    m.recordApiMetric({ endpoint: "/x", method: "GET", durationMs: 1, cached: false, status: 200, timestamp: 1 });
    m.recordNavigationMetric({ name: "ttfb", valueMs: 5, timestamp: 1 });
    m.recordRenderMetric({ component: "C", renderMs: 5, timestamp: 1 });
    m.markPageStart("p");
    m.markPageEnd("p", 3);
    m.resetMetrics();
    const snap = m.getSnapshot("after-reset");
    expect(snap.api).toHaveLength(0);
    expect(snap.navigation).toHaveLength(0);
    expect(snap.renders).toHaveLength(0);
    expect(snap.firstScreen).toHaveLength(0);
  });
});

describe("markPageStart / markPageEnd 首屏计时", () => {
  it("未 start 的页面 end 返回 -1 且不落指标", async () => {
    const m = await freshImport();
    expect(m.markPageEnd("ghost", 0)).toBe(-1);
    expect(m.getSnapshot("g").firstScreen).toHaveLength(0);
  });

  it("start→end 记录耗时且同一页面只结算一次", async () => {
    const m = await freshImport();
    m.markPageStart("procurement");
    const ms = m.markPageEnd("procurement", 12);
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(m.markPageEnd("procurement", 12)).toBe(-1); // end 后 timer 已删除
    const fs = m.getSnapshot("p").firstScreen;
    expect(fs).toHaveLength(1);
    expect(fs[0].itemCount).toBe(12);
  });
});

describe("printSnapshot", () => {
  it("输出包含核心指标行且对 null 指标打印 N/A", async () => {
    const m = await freshImport();
    const group = vi.spyOn(console, "group").mockImplementation(() => {});
    const groupEnd = vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    m.recordApiMetric({ endpoint: "/slow", method: "GET", durationMs: 800, cached: false, status: 200, timestamp: 1 });
    m.recordRenderMetric({ component: "X", renderMs: 40, timestamp: 1 });
    m.markPageStart("home");
    m.markPageEnd("home", 4);
    m.printSnapshot(m.getSnapshot("print-case"));

    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.startsWith("TTFB:"))).toBe(true); // 未采集时 N/A 也要打印
    expect(lines.some((l) => l.startsWith("API:"))).toBe(true);
    expect(lines.some((l) => l.includes("Slowest API:"))).toBe(true);
    expect(lines.some((l) => l.includes("Slowest Render:"))).toBe(true);
    expect(lines.some((l) => l.includes("home:"))).toBe(true);
    expect(group).toHaveBeenCalled();
    expect(groupEnd).toHaveBeenCalled();
  });
});
