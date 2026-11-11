import { describe, expect, it } from "vitest";
import { formatNoticeUTCDate, formatNoticeDate, formatNoticeDateOrNull, formatNoticeCstDate, formatNoticeTs, formatDeadlineForExport, resolveNoticeDeadlineTs, UNPUBLISHED_LABEL } from "@/shared/utils/notice-datetime/format";

const utc = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  Math.floor(Date.UTC(y, mo, d, h, mi) / 1000);

describe("formatNoticeUTCDate", () => {
  it("无时刻 → 纯日期", () => {
    expect(formatNoticeUTCDate(utc(2026, 9, 19), false)).toBe("2026-10-19");
  });
  it("有时刻 → 补 HH:mm（UTC）", () => {
    expect(formatNoticeUTCDate(utc(2026, 9, 19, 8, 5), true)).toBe("2026-10-19 08:05");
  });
  it("零/负数/null → 未公布", () => {
    expect(formatNoticeUTCDate(0)).toBe(UNPUBLISHED_LABEL);
    expect(formatNoticeUTCDate(-1)).toBe(UNPUBLISHED_LABEL);
    expect(formatNoticeUTCDate(null)).toBe(UNPUBLISHED_LABEL);
    expect(formatNoticeUTCDate(undefined)).toBe(UNPUBLISHED_LABEL);
  });
});

describe("formatNoticeDate", () => {
  it("ISO 纯日期", () => {
    expect(formatNoticeDate("2026-10-19")).toBe("2026-10-19");
  });
  it("英文带 12:00 AM（午夜默认）→ 只显日期", () => {
    expect(formatNoticeDate("31-Jul-2026 12:00 AM")).toBe("2026-07-31");
  });
  it("午夜 + 时区尾巴 → 只显日期", () => {
    expect(formatNoticeDate("2026-10-09 00:00 (UTC+02:00)")).toBe("2026-10-09");
  });
  it("非午夜 + 时区尾巴 → 保留时刻", () => {
    expect(formatNoticeDate("2026-09-23 04:07 (UTC+00:00)")).toBe("2026-09-23 04:07");
  });
  it("解析失败 → 未公布", () => {
    expect(formatNoticeDate("未公布")).toBe(UNPUBLISHED_LABEL);
    expect(formatNoticeDate("")).toBe(UNPUBLISHED_LABEL);
    expect(formatNoticeDate(null)).toBe(UNPUBLISHED_LABEL);
  });
});

describe("formatNoticeDateOrNull（i18n 调用方自定兜底）", () => {
  it("可解析→格式化串", () => {
    expect(formatNoticeDateOrNull("17-Oct-2026")).toBe("2026-10-17");
  });
  it("不可解析→null（不内置占位文案）", () => {
    expect(formatNoticeDateOrNull("未公布")).toBeNull();
    expect(formatNoticeDateOrNull(null)).toBeNull();
  });
});

describe("resolveNoticeDeadlineTs（语义层唯一口径）", () => {
  it("state=known 且有 effective_ts → 用它", () => {
    expect(resolveNoticeDeadlineTs({ state: "known", effectiveTs: 1792647000, fallbackSec: 1 })).toBe(1792647000);
  });
  it("state 非 known → null（不可信不露）", () => {
    expect(resolveNoticeDeadlineTs({ state: "placeholder", effectiveTs: null, fallbackSec: 2556028800 })).toBeNull();
  });
  it("无语义层行（state=null）→ 退化到 fallbackSec", () => {
    expect(resolveNoticeDeadlineTs({ state: null, effectiveTs: null, fallbackSec: 1793318400 })).toBe(1793318400);
  });
  it("无语义层行且 fallbackSec 无效 → null", () => {
    expect(resolveNoticeDeadlineTs({ state: null, effectiveTs: null, fallbackSec: 0 })).toBeNull();
  });
});

describe("formatNoticeCstDate（全站统一展示时区：北京时间）", () => {
  it("UTC 05:00 → 北京时间 13:00", () => {
    expect(formatNoticeCstDate(utc(2026, 10, 19, 5, 0), true)).toBe("2026-11-19 13:00");
  });
  it("跨日：UTC 20:00 → 北京时间次日 04:00", () => {
    expect(formatNoticeCstDate(utc(2026, 10, 19, 20, 0), true)).toBe("2026-11-20 04:00");
  });
  it("只出日期时不带时刻", () => {
    expect(formatNoticeCstDate(utc(2026, 10, 19, 5, 0), false)).toBe("2026-11-19");
  });
  it("无效值 → 未公布", () => {
    expect(formatNoticeCstDate(null)).toBe(UNPUBLISHED_LABEL);
    expect(formatNoticeCstDate(0)).toBe(UNPUBLISHED_LABEL);
  });
});

describe("formatDeadlineForExport（报告导出与前端同口径）", () => {
  it("显式时区 → 北京时间并标注", () => {
    expect(formatDeadlineForExport(utc(2026, 10, 19, 5, 0), "explicit", "GMT-04:00"))
      .toBe("2026-11-19 13:00（北京时间）");
  });
  it("assumed_utc → 原文墙上时间，不折算", () => {
    expect(formatDeadlineForExport(utc(2026, 10, 19, 5, 0), "assumed_utc", null))
      .toBe("2026-11-19 05:00（原文当地时间）");
  });
  it("源只有日期 → 只出日期，不臆造时刻", () => {
    expect(formatDeadlineForExport(utc(2026, 10, 19), "date", null)).toBe("2026-11-19");
  });
  it("空值 → 空串", () => {
    expect(formatDeadlineForExport(null)).toBe("");
    expect(formatDeadlineForExport(0)).toBe("");
  });
});

describe("formatNoticeTs（发布时间：源有真实时刻才到分）", () => {
  it("非零时刻 → 显示到分", () => {
    expect(formatNoticeTs(utc(2026, 10, 19, 10, 30))).toBe("2026-11-19 10:30");
  });
  it("零点 → 只显示日期（不臆造 00:00）", () => {
    expect(formatNoticeTs(utc(2026, 10, 19))).toBe("2026-11-19");
  });
  it("无效值 → 未公布", () => {
    expect(formatNoticeTs(null)).toBe(UNPUBLISHED_LABEL);
    expect(formatNoticeTs(0)).toBe(UNPUBLISHED_LABEL);
  });
});
