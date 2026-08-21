/**
 * src/core/perf/metrics.ts 测试
 *
 * 测试纯数据操作函数（recordXxx、resetMetrics、getSnapshot）。
 * collectNavigationMetrics / initPerfMonitor 依赖浏览器 Performance API，不在单元测试范围。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  recordApiMetric,
  recordRenderMetric,
  recordNavigationMetric,
  recordFirstScreen,
  getSnapshot,
  resetMetrics,
  type ApiMetric,
  type RenderMetric,
  type NavigationMetric,
  type FirstScreenMetric,
} from "../../../../src/core/perf/metrics";

beforeEach(() => {
  resetMetrics();
});

describe("recordApiMetric + getSnapshot", () => {
  it("记录 API 指标并出现在快照中", () => {
    const metric: ApiMetric = {
      endpoint: "/api/test",
      method: "GET",
      durationMs: 120,
      cached: false,
      status: 200,
      timestamp: Date.now(),
    };
    recordApiMetric(metric);
    const snap = getSnapshot("test");
    expect(snap.api).toHaveLength(1);
    expect(snap.api[0].endpoint).toBe("/api/test");
    expect(snap.api[0].durationMs).toBe(120);
  });

  it("多条 API 指标累计", () => {
    recordApiMetric({ endpoint: "/a", method: "GET", durationMs: 10, cached: false, status: 200, timestamp: 0 });
    recordApiMetric({ endpoint: "/b", method: "POST", durationMs: 20, cached: true, status: 201, timestamp: 0 });
    const snap = getSnapshot();
    expect(snap.api).toHaveLength(2);
  });
});

describe("recordRenderMetric", () => {
  it("记录渲染指标", () => {
    const metric: RenderMetric = { component: "Button", renderMs: 5, timestamp: Date.now() };
    recordRenderMetric(metric);
    const snap = getSnapshot();
    expect(snap.renders).toHaveLength(1);
    expect(snap.renders[0].component).toBe("Button");
  });
});

describe("recordNavigationMetric", () => {
  it("记录导航指标", () => {
    const metric: NavigationMetric = { name: "ttfb", valueMs: 100, timestamp: Date.now() };
    recordNavigationMetric(metric);
    const snap = getSnapshot();
    expect(snap.navigation).toHaveLength(1);
    expect(snap.navigation[0].name).toBe("ttfb");
  });
});

describe("recordFirstScreen", () => {
  it("记录首屏指标", () => {
    const metric: FirstScreenMetric = { page: "home", loadMs: 500, itemCount: 10, timestamp: Date.now() };
    recordFirstScreen(metric);
    const snap = getSnapshot();
    expect(snap.firstScreen).toHaveLength(1);
    expect(snap.firstScreen[0].page).toBe("home");
  });
});

describe("getSnapshot", () => {
  it("默认 label 为 'default'", () => {
    const snap = getSnapshot();
    expect(snap.label).toBe("default");
  });

  it("自定义 label", () => {
    const snap = getSnapshot("my-test");
    expect(snap.label).toBe("my-test");
    expect(snap.id).toContain("my-test");
  });

  it("summary 计算正确（空数据）", () => {
    const snap = getSnapshot();
    expect(snap.summary.totalApiCalls).toBe(0);
    expect(snap.summary.avgApiMs).toBe(0);
    expect(snap.summary.slowestApi).toBeNull();
    expect(snap.summary.avgRenderMs).toBe(0);
    expect(snap.summary.slowestRender).toBeNull();
    expect(snap.summary.cachedApiCalls).toBe(0);
  });

  it("summary 计算正确（有数据）", () => {
    recordApiMetric({ endpoint: "/a", method: "GET", durationMs: 100, cached: false, status: 200, timestamp: 0 });
    recordApiMetric({ endpoint: "/b", method: "GET", durationMs: 200, cached: true, status: 200, timestamp: 0 });
    recordRenderMetric({ component: "App", renderMs: 30, timestamp: 0 });
    recordNavigationMetric({ name: "ttfb", valueMs: 50, timestamp: 0 });
    recordNavigationMetric({ name: "fcp", valueMs: 80, timestamp: 0 });

    const snap = getSnapshot();
    expect(snap.summary.totalApiCalls).toBe(2);
    expect(snap.summary.avgApiMs).toBe(150);
    expect(snap.summary.slowestApi?.endpoint).toBe("/b");
    expect(snap.summary.cachedApiCalls).toBe(1);
    expect(snap.summary.avgRenderMs).toBe(30);
    expect(snap.summary.slowestRender?.component).toBe("App");
    expect(snap.summary.ttfb).toBe(50);
    expect(snap.summary.fcp).toBe(80);
    expect(snap.summary.lcp).toBeNull();
  });
});

describe("resetMetrics", () => {
  it("清空所有指标", () => {
    recordApiMetric({ endpoint: "/a", method: "GET", durationMs: 10, cached: false, status: 200, timestamp: 0 });
    recordRenderMetric({ component: "X", renderMs: 5, timestamp: 0 });
    recordNavigationMetric({ name: "ttfb", valueMs: 10, timestamp: 0 });
    recordFirstScreen({ page: "home", loadMs: 100, itemCount: 5, timestamp: 0 });

    resetMetrics();

    const snap = getSnapshot();
    expect(snap.api).toHaveLength(0);
    expect(snap.renders).toHaveLength(0);
    expect(snap.navigation).toHaveLength(0);
    expect(snap.firstScreen).toHaveLength(0);
  });
});
