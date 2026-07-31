import { describe, it, expect, vi, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  nextMonthlyRunAt,
  clearReportCache,
  startReportCacheCleanup,
} from "../../../server/services/reportCacheCleanup";

// ─── nextMonthlyRunAt ───────────────────────────────────────────────────────
describe("nextMonthlyRunAt", () => {
  it("returns next month 1st 08:00 for a mid-month time", () => {
    const now = new Date(2026, 6, 31, 22, 30); // 2026-07-31 22:30
    const next = nextMonthlyRunAt(now);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(7); // August
    expect(next.getDate()).toBe(1);
    expect(next.getHours()).toBe(8);
    expect(next.getMinutes()).toBe(0);
  });

  it("returns same-day 08:00 during the 1st before 8am", () => {
    const now = new Date(2026, 7, 1, 3, 0); // 2026-08-01 03:00
    const next = nextMonthlyRunAt(now);
    expect(next.getMonth()).toBe(7);
    expect(next.getDate()).toBe(1);
    expect(next.getHours()).toBe(8);
  });

  it("rolls over to next month when exactly at 08:00 on the 1st", () => {
    const now = new Date(2026, 7, 1, 8, 0, 0, 0);
    const next = nextMonthlyRunAt(now);
    expect(next.getMonth()).toBe(8); // September
    expect(next.getDate()).toBe(1);
  });

  it("crosses year boundary from December", () => {
    const now = new Date(2026, 11, 15, 12, 0);
    const next = nextMonthlyRunAt(now);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0);
    expect(next.getDate()).toBe(1);
  });
});

// ─── clearReportCache ───────────────────────────────────────────────────────
describe("clearReportCache", () => {
  it("removes only .docx files and returns count", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bid-report-test-"));
    try {
      await fs.writeFile(path.join(dir, "bid_report_1_2_abc.docx"), "a");
      await fs.writeFile(path.join(dir, "bid_report_3_4_def.DOCX"), "b");
      await fs.writeFile(path.join(dir, "keep.txt"), "c");
      const removed = await clearReportCache(dir);
      expect(removed).toBe(2);
      const left = await fs.readdir(dir);
      expect(left).toEqual(["keep.txt"]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("returns 0 when directory does not exist", async () => {
    const removed = await clearReportCache(path.join(os.tmpdir(), "no-such-dir-xyz"));
    expect(removed).toBe(0);
  });
});

// ─── startReportCacheCleanup ────────────────────────────────────────────────
describe("startReportCacheCleanup", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when disabled", () => {
    vi.useFakeTimers();
    const stop = startReportCacheCleanup({ enabled: false });
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it("schedules a segmented timer when enabled and stop() clears it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0)); // mid-month: far from run time
    const stop = startReportCacheCleanup({ enabled: true });
    expect(vi.getTimerCount()).toBe(1);
    // 分段唤醒（6h 段长），未到执行点应重新挂起下一段而不执行清理
    vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 1000);
    expect(vi.getTimerCount()).toBe(1);
    stop();
    vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
