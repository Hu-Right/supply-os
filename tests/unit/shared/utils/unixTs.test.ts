import { describe, it, expect, vi, afterEach } from "vitest";
import { toUnixMs, calendarDaysLeftCst } from "@/shared/utils/unixTs";

afterEach(() => {
  vi.useRealTimers();
});

describe("toUnixMs", () => {
  it("秒级时间戳转毫秒", () => {
    expect(toUnixMs(1_700_000_000)).toBe(1_700_000_000_000);
  });

  it("毫秒级时间戳原样返回", () => {
    expect(toUnixMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("边界值 1e12 归毫秒（2001-09-09，合理历史日期）", () => {
    expect(toUnixMs(1e12)).toBe(1e12);
  });

  it("边界值 1e12-1 归秒级并转毫秒", () => {
    expect(toUnixMs(1e12 - 1)).toBe((1e12 - 1) * 1000);
  });

  it("数字字符串正常解析", () => {
    expect(toUnixMs("1700000000")).toBe(1_700_000_000_000);
  });

  it("非数值字符串返回 NaN", () => {
    expect(toUnixMs("abc")).toBeNaN();
  });

  it("null / undefined / 空串返回 NaN", () => {
    expect(toUnixMs(null)).toBeNaN();
    expect(toUnixMs(undefined)).toBeNaN();
    expect(toUnixMs("")).toBeNaN();
  });

  it("0 原样返回 0（无截止日期哨兵值由调用方处理）", () => {
    expect(toUnixMs(0)).toBe(0);
  });
});

describe("calendarDaysLeftCst", () => {
  it("无效输入返回 null", () => {
    expect(calendarDaysLeftCst(NaN)).toBeNull();
    expect(calendarDaysLeftCst(0)).toBeNull();
    expect(calendarDaysLeftCst(-5)).toBeNull();
  });

  it("截止明天早于当前时刻：日历口径返回 1（24h 取整会误得 2）", () => {
    // 固定当前时刻：2026-09-12 05:00 UTC = 北京 13:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T05:00:00Z"));
    // 截止 2026-09-13 14:00 北京 = 09-13T06:00Z（距今 25h）
    const deadlineMs = Date.parse("2026-09-13T06:00:00Z");
    expect(calendarDaysLeftCst(deadlineMs)).toBe(1);
  });

  it("截止后天零点：返回 2（与 formatDeadlineZh \"后天\" 标签对齐）", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T05:00:00Z"));
    // 截止 2026-09-14 00:00 北京 = 09-13T16:00Z
    const deadlineMs = Date.parse("2026-09-13T16:00:00Z");
    expect(calendarDaysLeftCst(deadlineMs)).toBe(2);
  });

  it("今天截止返回 0，昨天截止返回 -1", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T05:00:00Z"));
    // 今天北京 00:00 = 09-11T16:00Z（已过期但仍在今天日历日内）
    expect(calendarDaysLeftCst(Date.parse("2026-09-11T16:00:00Z"))).toBe(0);
    // 昨天北京 00:00 = 09-10T16:00Z
    expect(calendarDaysLeftCst(Date.parse("2026-09-10T16:00:00Z"))).toBe(-1);
  });

  it("跨年场景：12-31 → 次年 01-01 返回 1", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T05:00:00Z")); // 北京 13:00
    // 2027-01-01 10:00 北京 = 2027-01-01T02:00Z
    expect(calendarDaysLeftCst(Date.parse("2027-01-01T02:00:00Z"))).toBe(1);
  });
});
