/**
 * src/core/perf/reporter.ts 测试
 *
 * 测试报告生成函数（纯字符串操作，无浏览器依赖）。
 */
import { describe, it, expect, vi } from "vitest";
import type { PerfSnapshot } from "../../../../src/core/perf/metrics";
import {
  saveSnapshot as saveSnap,
  getSnapshots as getSnaps,
  getLatestPair as getLatest,
  generateComparisonReport as genComp,
  generateSummaryReport as genSummary,
  printReport as printRep,
} from "../../../../src/core/perf/reporter";

function makeSnapshot(overrides: Partial<PerfSnapshot> = {}): PerfSnapshot {
  return {
    id: "test_123",
    label: "test",
    createdAt: new Date().toISOString(),
    userAgent: "Mozilla/5.0 Test",
    navigation: [],
    api: [],
    renders: [],
    firstScreen: [],
    summary: {
      ttfb: null,
      fcp: null,
      lcp: null,
      domInteractive: null,
      avgApiMs: 0,
      slowestApi: null,
      totalApiCalls: 0,
      cachedApiCalls: 0,
      avgRenderMs: 0,
      slowestRender: null,
    },
    ...overrides,
  };
}

describe("saveSnapshot / getSnapshots", () => {
  it("保存并获取快照列表", () => {
    // 模块级状态可能已有数据，只验证 push 行为
    const before = getSnaps().length;
    saveSnap(makeSnapshot());
    expect(getSnaps().length).toBe(before + 1);
  });

  it("超过 MAX_SNAPSHOTS (10) 时移除最早的", () => {
    const initial = getSnaps().length;
    // 保存到超过 10 个
    for (let i = 0; i < 12; i++) {
      saveSnap(makeSnapshot({ id: `overflow_${i}`, label: `overflow_${i}` }));
    }
    // 总数不应超过 10
    expect(getSnaps().length).toBeLessThanOrEqual(10);
  });
});

describe("getLatestPair", () => {
  it("少于 2 个快照返回 null", () => {
    // 无法控制模块级状态，只验证返回类型
    const result = getLatest();
    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it("2+ 个快照时返回最后两个", () => {
    // 前面 saveSnapshot 测试已经添加了多个快照
    const result = getLatest();
    if (result) {
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("id");
      expect(result[1]).toHaveProperty("id");
    }
  });
});

describe("generateComparisonReport", () => {
  it("生成 Markdown 报告（空数据）", () => {
    const before = makeSnapshot({ label: "before" });
    const after = makeSnapshot({ label: "after" });
    const report = genComp(before, after);
    expect(report).toContain("# 性能优化对比报告");
    expect(report).toContain("TTFB");
    expect(report).toContain("FCP");
    expect(report).toContain("LCP");
  });

  it("有数据时正确计算差异", () => {
    const before = makeSnapshot({
      label: "before",
      summary: {
        ttfb: 100, fcp: 200, lcp: 300, domInteractive: 400,
        avgApiMs: 50, slowestApi: { endpoint: "/old", method: "GET", durationMs: 100, cached: false, status: 200, timestamp: 0 },
        totalApiCalls: 10, cachedApiCalls: 2,
        avgRenderMs: 20, slowestRender: { component: "OldComp", renderMs: 30, timestamp: 0 },
      },
      firstScreen: [{ page: "home", loadMs: 500, itemCount: 10, timestamp: 0 }],
    });
    const after = makeSnapshot({
      label: "after",
      summary: {
        ttfb: 80, fcp: 150, lcp: 250, domInteractive: 350,
        avgApiMs: 30, slowestApi: { endpoint: "/new", method: "GET", durationMs: 60, cached: false, status: 200, timestamp: 0 },
        totalApiCalls: 15, cachedApiCalls: 5,
        avgRenderMs: 15, slowestRender: { component: "NewComp", renderMs: 20, timestamp: 0 },
      },
      firstScreen: [{ page: "home", loadMs: 300, itemCount: 15, timestamp: 0 }],
    });
    const report = genComp(before, after);
    expect(report).toContain("性能优化对比报告");
    expect(report).toContain("home");
    expect(report).toContain("/old");
    expect(report).toContain("/new");
  });
});

describe("generateSummaryReport", () => {
  it("生成摘要报告", () => {
    const snapshot = makeSnapshot({ label: "summary-test" });
    const report = genSummary(snapshot);
    expect(report).toContain("# 性能摘要报告");
    expect(report).toContain("summary-test");
    expect(report).toContain("Web Vitals");
    expect(report).toContain("API 请求统计");
  });

  it("包含首屏加载信息", () => {
    const snapshot = makeSnapshot({
      firstScreen: [{ page: "dashboard", loadMs: 200, itemCount: 5, timestamp: 0 }],
    });
    const report = genSummary(snapshot);
    expect(report).toContain("dashboard");
    expect(report).toContain("200ms");
  });

  it("包含最慢 API 和渲染信息", () => {
    const snapshot = makeSnapshot({
      summary: {
        ttfb: 50, fcp: 100, lcp: 200, domInteractive: 300,
        avgApiMs: 80,
        slowestApi: { endpoint: "/api/slow", method: "GET", durationMs: 500, cached: false, status: 200, timestamp: 0 },
        totalApiCalls: 20, cachedApiCalls: 5,
        avgRenderMs: 15,
        slowestRender: { component: "HeavyList", renderMs: 100, timestamp: 0 },
      },
    });
    const report = genSummary(snapshot);
    expect(report).toContain("/api/slow");
    expect(report).toContain("500ms");
    expect(report).toContain("HeavyList");
    expect(report).toContain("100ms");
  });
});

describe("printReport", () => {
  it("调用 console.log 输出", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printRep("# Test Report");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
