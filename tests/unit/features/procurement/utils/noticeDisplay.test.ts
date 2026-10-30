/**
 * 截止时间展示口径测试（2026-10-30 用户确认：只展示发标地当地时间，不再拼时区说明）
 *
 * 覆盖：
 *  - 显式 GMT 偏移 / IANA 时区令牌 → 换算到发标地当地时间；
 *  - 抓取侧自由文本时区注释（如「菲律宾时间（PHT，UTC+8）；北京时间（UTC+8）」）→ 不进展示；
 *  - 语义层来源：assumed_utc 按墙上时间还原、date 只出日期（不臆造 00:00）；
 *  - 无任何时区信息的兜底口径；
 *  - 注册制/框架结束前缀。
 */
import { describe, it, expect } from "vitest";
import { formatNoticeDeadline } from "@/features/procurement/utils/noticeDisplay";
import { parseDeadlineZone, pickDeadlineZoneToken } from "@/shared/utils/notice-datetime/timezone";

type Translate = (key: string, params?: Record<string, string | number>) => string;

const t = ((key: string) => {
  const dict: Record<string, string> = {
    procurement_deadlineRegistration: "注册制结束",
    procurement_deadlineFramework: "框架协议结束",
  };
  return dict[key] ?? key;
}) as Translate;

/** 2026-11-19T05:00:00Z = 菲律宾/北京时间 13:00、GMT-04:00 的 01:00、Riga(EET+2) 的 07:00 */
const TS = 1795064400;

describe("parseDeadlineZone / pickDeadlineZoneToken", () => {
  it("解析 GMT 显式偏移", () => {
    expect(parseDeadlineZone("GMT+08:00")).toEqual({ kind: "offset", minutes: 480 });
    expect(parseDeadlineZone("GMT-04:00")).toEqual({ kind: "offset", minutes: -240 });
    expect(parseDeadlineZone("UTC+05:45")).toEqual({ kind: "offset", minutes: 345 });
    expect(parseDeadlineZone("UTC")).toEqual({ kind: "offset", minutes: 0 });
  });

  it("解析 IANA 时区", () => {
    expect(parseDeadlineZone("Europe/Riga")).toEqual({ kind: "iana", zone: "Europe/Riga" });
  });

  it("自由文本 / 空值 / 越界偏移一律不是令牌", () => {
    expect(parseDeadlineZone("菲律宾时间（PHT，UTC+8）；北京时间（UTC+8）")).toBeNull();
    expect(parseDeadlineZone("")).toBeNull();
    expect(parseDeadlineZone(null)).toBeNull();
    expect(parseDeadlineZone("GMT+15:00")).toBeNull();
    expect(parseDeadlineZone("Not/AZone")).toBeNull();
  });

  it("pick 取第一个可解析令牌，自由文本被跳过", () => {
    expect(pickDeadlineZoneToken(null, "菲律宾时间（PHT，UTC+8）", "Europe/Riga")).toBe("Europe/Riga");
    expect(pickDeadlineZoneToken("自由文本", null)).toBe("");
  });
});

describe("formatNoticeDeadline（发标地当地时间）", () => {
  it("GMT+08:00 → 当地 13:00，且不拼时区说明", () => {
    expect(formatNoticeDeadline(TS, "bid", "GMT+08:00", "zh", t)).toBe("2026/11/19 13:00");
  });

  it("GMT-04:00 → 按目标偏移换算", () => {
    expect(formatNoticeDeadline(TS, "bid", "GMT-04:00", "zh", t)).toBe("2026/11/19 01:00");
  });

  it("IANA 时区按该时区换算", () => {
    expect(formatNoticeDeadline(TS, "bid", "Europe/Riga", "zh", t)).toBe("2026/11/19 07:00");
  });

  it("自由文本时区注释不进入展示；无令牌时 zh 按 +08:00 还原", () => {
    expect(
      formatNoticeDeadline(TS, "bid", "菲律宾时间（PHT，UTC+8）；北京时间（UTC+8）", "zh", t),
    ).toBe("2026/11/19 13:00");
  });

  it("assumed_utc：ts 即墙上时间，按 UTC 还原（不 +8 偏移）", () => {
    expect(formatNoticeDeadline(TS, "bid", null, "zh", t, "assumed_utc")).toBe("2026/11/19 05:00");
  });

  it("date：源只有日期，只出日期不臆造时刻", () => {
    expect(formatNoticeDeadline(TS, "bid", null, "zh", t, "date")).toBe("2026/11/19");
  });

  it("注册制 / 框架结束仍带类型前缀", () => {
    expect(formatNoticeDeadline(TS, "registration", "GMT+08:00", "zh", t)).toBe("注册制结束：2026/11/19 13:00");
    expect(formatNoticeDeadline(TS, "framework_end", "GMT+08:00", "zh", t)).toBe("框架协议结束：2026/11/19 13:00");
  });

  it("无有效时间戳返回空串（由调用方给占位文案）", () => {
    expect(formatNoticeDeadline(null, "bid", "GMT+08:00", "zh", t)).toBe("");
    expect(formatNoticeDeadline("", "bid", null, "zh", t)).toBe("");
    expect(formatNoticeDeadline(0, "bid", null, "zh", t)).toBe("");
  });
});
