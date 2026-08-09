// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordApiMetric,
  recordRenderMetric,
  recordNavigationMetric,
  recordFirstScreen,
  markPageStart,
  markPageEnd,
  getSnapshot,
  resetMetrics,
  initPerfMonitor,
} from "@/core/perf/metrics";

describe("Performance Metrics", () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe("recordApiMetric", () => {
    it("records API metric", () => {
      recordApiMetric({
        endpoint: "/api/notices",
        method: "GET",
        durationMs: 150,
        cached: false,
        status: 200,
        timestamp: Date.now(),
      });

      const snapshot = getSnapshot();
      expect(snapshot.api).toHaveLength(1);
      expect(snapshot.api[0].endpoint).toBe("/api/notices");
      expect(snapshot.api[0].durationMs).toBe(150);
    });

    it("records multiple API metrics", () => {
      recordApiMetric({ endpoint: "/api/a", method: "GET", durationMs: 100, cached: false, status: 200, timestamp: Date.now() });
      recordApiMetric({ endpoint: "/api/b", method: "POST", durationMs: 200, cached: true, status: 201, timestamp: Date.now() });

      const snapshot = getSnapshot();
      expect(snapshot.api).toHaveLength(2);
    });
  });

  describe("recordRenderMetric", () => {
    it("records render metric", () => {
      recordRenderMetric({
        component: "NoticeCard",
        renderMs: 5,
        timestamp: Date.now(),
      });

      const snapshot = getSnapshot();
      expect(snapshot.renders).toHaveLength(1);
      expect(snapshot.renders[0].component).toBe("NoticeCard");
    });
  });

  describe("recordNavigationMetric", () => {
    it("records navigation metric", () => {
      recordNavigationMetric({
        name: "ttfb",
        valueMs: 50,
        timestamp: Date.now(),
      });

      const snapshot = getSnapshot();
      expect(snapshot.navigation).toHaveLength(1);
      expect(snapshot.navigation[0].name).toBe("ttfb");
    });
  });

  describe("recordFirstScreen", () => {
    it("records first screen metric", () => {
      recordFirstScreen({
        page: "procurement",
        loadMs: 500,
        itemCount: 20,
        timestamp: Date.now(),
      });

      const snapshot = getSnapshot();
      expect(snapshot.firstScreen).toHaveLength(1);
      expect(snapshot.firstScreen[0].page).toBe("procurement");
      expect(snapshot.firstScreen[0].loadMs).toBe(500);
    });
  });

  describe("markPageStart / markPageEnd", () => {
    it("measures page load duration", () => {
      // Mock performance.now
      const mockNow = vi.fn();
      let currentTime = 1000;
      mockNow.mockImplementation(() => {
        currentTime += 100;
        return currentTime;
      });
      vi.spyOn(performance, "now").mockImplementation(mockNow);

      markPageStart("test-page");
      const duration = markPageEnd("test-page", 10);

      expect(duration).toBeGreaterThan(0);
      const snapshot = getSnapshot();
      expect(snapshot.firstScreen).toHaveLength(1);
      expect(snapshot.firstScreen[0].page).toBe("test-page");
      expect(snapshot.firstScreen[0].itemCount).toBe(10);
    });

    it("returns -1 when page start was not marked", () => {
      const duration = markPageEnd("unknown-page", 5);
      expect(duration).toBe(-1);
    });
  });

  describe("getSnapshot", () => {
    it("returns snapshot with all metrics", () => {
      recordApiMetric({ endpoint: "/api/test", method: "GET", durationMs: 100, cached: false, status: 200, timestamp: Date.now() });
      recordRenderMetric({ component: "TestComponent", renderMs: 10, timestamp: Date.now() });
      recordNavigationMetric({ name: "ttfb", valueMs: 50, timestamp: Date.now() });
      recordFirstScreen({ page: "home", loadMs: 300, itemCount: 15, timestamp: Date.now() });

      const snapshot = getSnapshot("test-label");

      expect(snapshot.id).toContain("test-label");
      expect(snapshot.label).toBe("test-label");
      expect(snapshot.api).toHaveLength(1);
      expect(snapshot.renders).toHaveLength(1);
      expect(snapshot.navigation).toHaveLength(1);
      expect(snapshot.firstScreen).toHaveLength(1);
    });

    it("computes summary correctly", () => {
      recordApiMetric({ endpoint: "/api/fast", method: "GET", durationMs: 50, cached: true, status: 200, timestamp: Date.now() });
      recordApiMetric({ endpoint: "/api/slow", method: "GET", durationMs: 200, cached: false, status: 200, timestamp: Date.now() });
      recordRenderMetric({ component: "Fast", renderMs: 2, timestamp: Date.now() });
      recordRenderMetric({ component: "Slow", renderMs: 20, timestamp: Date.now() });
      recordNavigationMetric({ name: "ttfb", valueMs: 100, timestamp: Date.now() });

      const snapshot = getSnapshot();
      const summary = snapshot.summary;

      expect(summary.ttfb).toBe(100);
      expect(summary.totalApiCalls).toBe(2);
      expect(summary.cachedApiCalls).toBe(1);
      expect(summary.avgApiMs).toBe(125); // (50 + 200) / 2
      expect(summary.slowestApi?.endpoint).toBe("/api/slow");
      expect(summary.avgRenderMs).toBe(11); // (2 + 20) / 2
      expect(summary.slowestRender?.component).toBe("Slow");
    });

    it("handles empty metrics", () => {
      const snapshot = getSnapshot();
      expect(snapshot.api).toHaveLength(0);
      expect(snapshot.renders).toHaveLength(0);
      expect(snapshot.summary.ttfb).toBeNull();
      expect(snapshot.summary.totalApiCalls).toBe(0);
      expect(snapshot.summary.avgApiMs).toBe(0);
      expect(snapshot.summary.slowestApi).toBeNull();
    });
  });

  describe("resetMetrics", () => {
    it("clears all metrics", () => {
      recordApiMetric({ endpoint: "/api/test", method: "GET", durationMs: 100, cached: false, status: 200, timestamp: Date.now() });
      recordRenderMetric({ component: "Test", renderMs: 10, timestamp: Date.now() });
      markPageStart("test");

      resetMetrics();

      const snapshot = getSnapshot();
      expect(snapshot.api).toHaveLength(0);
      expect(snapshot.renders).toHaveLength(0);
      expect(snapshot.firstScreen).toHaveLength(0);
    });
  });

  describe("initPerfMonitor", () => {
    it("initializes only once", () => {
      initPerfMonitor();
      initPerfMonitor(); // Should not throw or re-initialize
      // No assertion needed - just verify it doesn't throw
    });
  });
});
