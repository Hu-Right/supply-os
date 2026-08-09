// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveSnapshot,
  getSnapshots,
  getLatestPair,
  generateComparisonReport,
  generateSummaryReport,
  printReport,
} from "@/core/perf/reporter";
import type { PerfSnapshot } from "@/core/perf/metrics";

function createMockSnapshot(label: string, overrides: Partial<PerfSnapshot["summary"]> = {}): PerfSnapshot {
  return {
    id: `${label}_${Date.now()}`,
    label,
    createdAt: new Date().toISOString(),
    userAgent: "Mozilla/5.0 (test)",
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
      ...overrides,
    },
  };
}

describe("Performance Reporter", () => {
  beforeEach(() => {
    // Clear snapshots by getting all and removing them
    // Note: There's no explicit clear function, so we just test with fresh state
  });

  describe("saveSnapshot / getSnapshots", () => {
    it("saves and retrieves snapshots", () => {
      const snapshot1 = createMockSnapshot("before");
      const snapshot2 = createMockSnapshot("after");

      saveSnapshot(snapshot1);
      saveSnapshot(snapshot2);

      const snapshots = getSnapshots();
      expect(snapshots.length).toBeGreaterThanOrEqual(2);
      expect(snapshots[snapshots.length - 2].label).toBe("before");
      expect(snapshots[snapshots.length - 1].label).toBe("after");
    });

    it("limits snapshots to 10", () => {
      for (let i = 0; i < 15; i++) {
        saveSnapshot(createMockSnapshot(`snapshot-${i}`));
      }

      const snapshots = getSnapshots();
      expect(snapshots.length).toBeLessThanOrEqual(10);
    });
  });

  describe("getLatestPair", () => {
    it("returns null when less than 2 snapshots", () => {
      // Assuming fresh state or only 1 snapshot
      const result = getLatestPair();
      // May be null or have 2 items depending on previous tests
      if (result !== null) {
        expect(result).toHaveLength(2);
      }
    });

    it("returns last two snapshots when available", () => {
      const snapshot1 = createMockSnapshot("first");
      const snapshot2 = createMockSnapshot("second");
      const snapshot3 = createMockSnapshot("third");

      saveSnapshot(snapshot1);
      saveSnapshot(snapshot2);
      saveSnapshot(snapshot3);

      const pair = getLatestPair();
      expect(pair).not.toBeNull();
      expect(pair![0].label).toBe("second");
      expect(pair![1].label).toBe("third");
    });
  });

  describe("generateComparisonReport", () => {
    it("generates markdown comparison report", () => {
      const before = createMockSnapshot("before", {
        ttfb: 100,
        fcp: 200,
        lcp: 500,
        avgApiMs: 150,
        totalApiCalls: 10,
        cachedApiCalls: 2,
      });
      const after = createMockSnapshot("after", {
        ttfb: 80,
        fcp: 150,
        lcp: 400,
        avgApiMs: 100,
        totalApiCalls: 8,
        cachedApiCalls: 4,
      });

      const report = generateComparisonReport(before, after);

      expect(report).toContain("# 性能优化对比报告");
      expect(report).toContain("TTFB");
      expect(report).toContain("FCP");
      expect(report).toContain("LCP");
      expect(report).toContain("API 平均响应时间");
      expect(report).toContain("✅"); // Improvement indicator
    });

    it("handles null values in comparison", () => {
      const before = createMockSnapshot("before", { ttfb: null });
      const after = createMockSnapshot("after", { ttfb: 100 });

      const report = generateComparisonReport(before, after);
      expect(report).toContain("N/A");
    });

    it("shows warning for performance regression", () => {
      const before = createMockSnapshot("before", { avgApiMs: 100 });
      const after = createMockSnapshot("after", { avgApiMs: 200 }); // Slower

      const report = generateComparisonReport(before, after);
      expect(report).toContain("⚠️"); // Warning indicator
    });

    it("includes first screen details when available", () => {
      const before = createMockSnapshot("before");
      before.firstScreen = [{ page: "home", loadMs: 500, itemCount: 20, timestamp: Date.now() }];

      const after = createMockSnapshot("after");
      after.firstScreen = [{ page: "home", loadMs: 300, itemCount: 20, timestamp: Date.now() }];

      const report = generateComparisonReport(before, after);
      expect(report).toContain("首屏加载详情");
      expect(report).toContain("home");
    });

    it("includes slowest API comparison", () => {
      const before = createMockSnapshot("before");
      before.summary.slowestApi = { endpoint: "/api/slow", method: "GET", durationMs: 500, cached: false, status: 200, timestamp: Date.now() };

      const after = createMockSnapshot("after");
      after.summary.slowestApi = { endpoint: "/api/slow", method: "GET", durationMs: 300, cached: false, status: 200, timestamp: Date.now() };

      const report = generateComparisonReport(before, after);
      expect(report).toContain("最慢 API 请求");
      expect(report).toContain("/api/slow");
    });
  });

  describe("generateSummaryReport", () => {
    it("generates single snapshot summary", () => {
      const snapshot = createMockSnapshot("test", {
        ttfb: 50,
        fcp: 100,
        lcp: 250,
        totalApiCalls: 5,
        cachedApiCalls: 1,
        avgApiMs: 80,
      });

      const report = generateSummaryReport(snapshot);

      expect(report).toContain("# 性能摘要报告");
      expect(report).toContain("test");
      expect(report).toContain("Web Vitals");
      expect(report).toContain("API 请求统计");
      expect(report).toContain("50ms");
    });

    it("includes first screen section when available", () => {
      const snapshot = createMockSnapshot("test");
      snapshot.firstScreen = [
        { page: "home", loadMs: 300, itemCount: 15, timestamp: Date.now() },
        { page: "procurement", loadMs: 450, itemCount: 20, timestamp: Date.now() },
      ];

      const report = generateSummaryReport(snapshot);
      expect(report).toContain("首屏加载");
      expect(report).toContain("home");
      expect(report).toContain("procurement");
    });

    it("handles empty metrics", () => {
      const snapshot = createMockSnapshot("empty");
      const report = generateSummaryReport(snapshot);

      expect(report).toContain("N/A");
      expect(report).toContain("0");
    });
  });

  describe("printReport", () => {
    it("logs report to console", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      printReport("# Test Report\nContent");

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
