import { describe, expect, it } from "vitest";
import { parseNoticeDate } from "@/shared/utils/notice-datetime/parse";

const utc = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  Math.floor(Date.UTC(y, mo, d, h, mi) / 1000);

describe("parseNoticeDate · ISO", () => {
  it("纯日期 → 有 ts、hasTime=false", () => {
    expect(parseNoticeDate("2026-10-19")).toEqual({ ts: utc(2026, 9, 19), hasTime: false });
  });
  it("带 T 时刻 → hasTime=true", () => {
    expect(parseNoticeDate("2026-10-19T14:30:00")).toEqual({ ts: utc(2026, 9, 19, 14, 30), hasTime: true });
  });
  it("带空格时刻 → hasTime=true", () => {
    expect(parseNoticeDate("2026-10-19 08:05")).toEqual({ ts: utc(2026, 9, 19, 8, 5), hasTime: true });
  });
});

describe("parseNoticeDate · 英文 D-Mon-YYYY", () => {
  it("31-Oct-2025 → hasTime=false", () => {
    expect(parseNoticeDate("31-Oct-2025")).toEqual({ ts: utc(2025, 9, 31), hasTime: false });
  });
  it("12:00 AM 视为午夜默认 → hasTime=false（不显示 00:00）", () => {
    expect(parseNoticeDate("31-Jul-2026 12:00 AM")).toEqual({ ts: utc(2026, 6, 31, 0, 0), hasTime: false });
  });
  it("01:30 PM → 13:30", () => {
    expect(parseNoticeDate("01-Jan-2026 1:30 PM")).toEqual({ ts: utc(2026, 0, 1, 13, 30), hasTime: true });
  });
  it("月份词大小写不敏感", () => {
    expect(parseNoticeDate("31-oct-2025")).toEqual({ ts: utc(2025, 9, 31), hasTime: false });
  });
});

describe("parseNoticeDate · 不臆造", () => {
  it("空/null/undefined → null", () => {
    expect(parseNoticeDate("")).toBeNull();
    expect(parseNoticeDate(null)).toBeNull();
    expect(parseNoticeDate(undefined)).toBeNull();
  });
  it("占位/中文/斜杠/垃圾 → null", () => {
    expect(parseNoticeDate("未公布")).toBeNull();
    expect(parseNoticeDate("10/20/2026")).toBeNull();
    expect(parseNoticeDate("garbage")).toBeNull();
  });
  it("尾部有非时刻内容 → null（不猜）", () => {
    expect(parseNoticeDate("2026-10-19 blah")).toBeNull();
  });
  it("越界月/日 → null", () => {
    expect(parseNoticeDate("2026-13-01")).toBeNull();
    expect(parseNoticeDate("2026-01-32")).toBeNull();
    expect(parseNoticeDate("31-Xyz-2026")).toBeNull();
  });
});

describe("parseNoticeDate · 时区尾巴 / 午夜默认", () => {
  it("(UTC+02:00) 午夜尾巴 → 忽略偏移、只取日期", () => {
    expect(parseNoticeDate("2026-10-09 00:00 (UTC+02:00)")).toEqual({ ts: utc(2026, 9, 9, 0, 0), hasTime: false });
  });
  it("00:00:00 午夜 → hasTime=false", () => {
    expect(parseNoticeDate("2026-10-21 00:00:00")).toEqual({ ts: utc(2026, 9, 21), hasTime: false });
  });
  it("非午夜 + (UTC+00:00) → 保留真实时刻", () => {
    expect(parseNoticeDate("2026-09-23 04:07 (UTC+00:00)")).toEqual({ ts: utc(2026, 8, 23, 4, 7), hasTime: true });
  });
  it("(UTC+1200) 紧凑偏移也忽略", () => {
    expect(parseNoticeDate("2026-10-01 09:00 (UTC+1200)")).toEqual({ ts: utc(2026, 9, 1, 9, 0), hasTime: true });
  });
  it("只有时区、无时刻 → 纯日期", () => {
    expect(parseNoticeDate("2026-10-19 (UTC+02:00)")).toEqual({ ts: utc(2026, 9, 19), hasTime: false });
  });
});
