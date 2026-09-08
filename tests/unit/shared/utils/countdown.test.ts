import { describe, it, expect } from "vitest";
import { getCountdown, formatPublishDate } from "@/shared/utils/countdown";

describe("getCountdown", () => {
  it("null/undefined 返回 null", () => {
    expect(getCountdown(null)).toBeNull();
    expect(getCountdown(undefined)).toBeNull();
  });

  it("0 返回 null", () => {
    expect(getCountdown(0)).toBeNull();
  });

  it("过去时间戳返回 null", () => {
    expect(getCountdown(1000)).toBeNull(); // 1970 年
  });

  it("未来时间戳返回剩余天数和时间", () => {
    // 2 天后的秒级时间戳
    const futureSec = Math.floor(Date.now() / 1000) + 2 * 86400 + 3600;
    const result = getCountdown(futureSec);
    expect(result).not.toBeNull();
    expect(result!.days).toBeGreaterThanOrEqual(1);
    expect(result!.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("毫秒级时间戳也能正确处理", () => {
    const futureMs = Date.now() + 5 * 86400 * 1000;
    const result = getCountdown(futureMs);
    expect(result).not.toBeNull();
    expect(result!.days).toBeGreaterThanOrEqual(4);
  });

  it("NaN 字符串返回 null", () => {
    expect(getCountdown("not-a-number")).toBeNull();
  });
});

describe("formatPublishDate", () => {
  it("undefined 返回 -", () => {
    expect(formatPublishDate(undefined)).toBe("-");
  });

  it("空字符串返回 -", () => {
    expect(formatPublishDate("")).toBe("-");
  });

  it("秒级时间戳格式化为 YYYY-MM-DD", () => {
    // 2026-01-15 00:00:00 UTC
    expect(formatPublishDate(1768435200)).toBe("2026-01-15");
  });

  it("毫秒级时间戳也能处理", () => {
    expect(formatPublishDate(1768435200000)).toBe("2026-01-15");
  });

  it("ISO 字符串也能处理", () => {
    expect(formatPublishDate("2026-06-01T00:00:00Z")).toBe("2026-06-01");
  });

  it("无效日期返回 -", () => {
    expect(formatPublishDate("not-a-date")).toBe("-");
  });

  it("年份 < 2000 返回 -", () => {
    expect(formatPublishDate("1999-12-31")).toBe("-");
  });
});
