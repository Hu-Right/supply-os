/**
 * src/features/procurement/utils/formatDeadlineZh.ts 测试
 */
import { describe, it, expect } from "vitest";
import { formatDeadlineZh } from "../../../../../src/features/procurement/utils/formatDeadlineZh";

describe("formatDeadlineZh", () => {
  it("空值返回空字符串", () => {
    expect(formatDeadlineZh(null)).toBe("");
    expect(formatDeadlineZh(undefined)).toBe("");
    expect(formatDeadlineZh("")).toBe("");
  });

  it("deadlineTs=0 返回原文（无截止日期哨兵值）", () => {
    expect(formatDeadlineZh("2026-08-20", 0)).toBe("2026-08-20");
  });

  it("deadlineTs 为 NaN 字符串返回原文", () => {
    expect(formatDeadlineZh("2026-08-20", "abc")).toBe("2026-08-20");
  });

  it("秒级时间戳格式化", () => {
    // 2026-08-20T10:00:00 UTC = 1787299200 秒
    // CST = UTC+8 = 18:00
    const ts = Math.floor(new Date("2026-08-20T10:00:00Z").getTime() / 1000);
    const result = formatDeadlineZh(null, ts);
    expect(result).toContain("时");
    expect(result).toContain("分");
  });

  it("毫秒级时间戳格式化", () => {
    const ts = new Date("2026-08-20T10:00:00Z").getTime();
    const result = formatDeadlineZh(null, ts);
    expect(result).toContain("时");
    expect(result).toContain("分");
  });

  it("deadline 字符串（无时间戳）格式化", () => {
    // 使用一个远离当前日期的值，确保不会匹配到"今天/明天/后天"
    const result = formatDeadlineZh("2030-03-15");
    expect(result).toContain("月");
    expect(result).toContain("日");
  });

  it("无效日期字符串返回原文", () => {
    expect(formatDeadlineZh("not-a-date")).toBe("not-a-date");
  });

  it("deadline 字符串含 T 自动补 Z", () => {
    const result = formatDeadlineZh("2026-08-20T10:30:00");
    expect(result).toBeTruthy();
  });

  // 计算 CST（UTC+8）的"今天"零点 UTC 时间戳
  function cstToday(): Date {
    const now = new Date();
    const cstNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return new Date(Date.UTC(cstNow.getUTCFullYear(), cstNow.getUTCMonth(), cstNow.getUTCDate()));
  }

  it("明天 分支", () => {
    // CST 明天 00:00 → UTC 时间戳
    const tomorrow = cstToday();
    const tsMs = tomorrow.getTime() + 1 * 24 * 60 * 60 * 1000;
    // 减去 8h 偏移得到 UTC 时间对应的 Date
    const date = new Date(tsMs - 8 * 60 * 60 * 1000);
    const result = formatDeadlineZh(date.toISOString().replace("Z", ""));
    expect(result).toContain("明天");
  });

  it("后天 分支", () => {
    const tomorrow = cstToday();
    const tsMs = tomorrow.getTime() + 2 * 24 * 60 * 60 * 1000;
    const date = new Date(tsMs - 8 * 60 * 60 * 1000);
    const result = formatDeadlineZh(date.toISOString().replace("Z", ""));
    expect(result).toContain("后天");
  });

  it("昨天 分支", () => {
    const tomorrow = cstToday();
    const tsMs = tomorrow.getTime() - 1 * 24 * 60 * 60 * 1000;
    const date = new Date(tsMs - 8 * 60 * 60 * 1000);
    const result = formatDeadlineZh(date.toISOString().replace("Z", ""));
    expect(result).toContain("昨天");
  });

  it("前天 分支", () => {
    const tomorrow = cstToday();
    const tsMs = tomorrow.getTime() - 2 * 24 * 60 * 60 * 1000;
    const date = new Date(tsMs - 8 * 60 * 60 * 1000);
    const result = formatDeadlineZh(date.toISOString().replace("Z", ""));
    expect(result).toContain("前天");
  });

  it("deadlineTs 为空字符串走 deadline 分支", () => {
    const result = formatDeadlineZh("2030-06-15", "");
    expect(result).toContain("月");
  });
});
