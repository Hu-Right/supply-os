/**
 * source-date 统一识别器 · 单元测试
 *
 * 覆盖「识别为并集、策略分层」的三条策略线：
 *   - 格式并集：ISO / D-Mon / 斜杠 / 数字串 / 时区标注（含紧凑 UTC+1200）
 *   - 策略差异：AM/PM 换算、ISO 小时位数、D-Mon 时分保留与否、残尾 ignore/reject
 *   - 不臆造：无效月日、空值、无法识别一律 null
 *
 * 真实语料上的「零漂移」由 golden.test.ts 守；本文件只管边界与开关语义。
 */
import { describe, expect, it } from "vitest";
import {
  parseSourceDateParts,
  sourceDateWallSeconds,
  SOURCE_DATE_PROFILES,
} from "@/shared/utils/notice-datetime/source-date";

const wall = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
  Math.floor(Date.UTC(y, mo - 1, d, h, mi, s) / 1000);

describe("parseSourceDateParts · 格式并集", () => {
  it("ISO 纯日期：h=null 表示源无时分", () => {
    const p = parseSourceDateParts("2026-10-19", SOURCE_DATE_PROFILES.display)!;
    expect(p).toMatchObject({ y: 2026, mo: 10, d: 19, h: null, mi: 0, s: 0, via: "iso" });
    expect(sourceDateWallSeconds(p)).toBe(wall(2026, 10, 19));
  });

  it("D-Mon：月名大小写不敏感、取前 3 字母", () => {
    const p = parseSourceDateParts("31-oct-2025", SOURCE_DATE_PROFILES.display)!;
    expect(p).toMatchObject({ y: 2025, mo: 10, d: 31, h: null, via: "dmon" });
  });

  it("括号时区：(GMT -4.00) → -240 分钟并给出归一标签", () => {
    const p = parseSourceDateParts("31-Dec-2026 23:59 (GMT -4.00)", SOURCE_DATE_PROFILES.classify)!;
    expect(p).toMatchObject({
      h: 23, mi: 59, offsetMinutes: -240, hasExplicitOffset: true, tzLabel: "GMT-04:00",
    });
  });

  it("紧凑偏移：(UTC+1200) 不再被截成 +12 并留下残尾", () => {
    const p = parseSourceDateParts("2026-10-01 09:00 (UTC+1200)", SOURCE_DATE_PROFILES.display)!;
    expect(p).toMatchObject({ h: 9, offsetMinutes: 720, hasExplicitOffset: true, tzLabel: "GMT+12:00" });
  });

  it("尾部 +HH:MM 与 Z", () => {
    expect(parseSourceDateParts("2026-10-19T12:00:00+05:30", SOURCE_DATE_PROFILES.display))
      .toMatchObject({ offsetMinutes: 330, tzLabel: "GMT+05:30" });
    expect(parseSourceDateParts("2026-10-19T12:00:00Z", SOURCE_DATE_PROFILES.display))
      .toMatchObject({ offsetMinutes: 0, tzLabel: "UTC" });
  });

  it("裸 GMT+2（无括号）也识别为显式偏移", () => {
    const p = parseSourceDateParts("2026-10-19 12:00 GMT+2", SOURCE_DATE_PROFILES.display)!;
    expect(p).toMatchObject({ h: 12, offsetMinutes: 120, tzLabel: "GMT+02:00" });
  });

  it("纯标注 (GMT) 只剥离、不算显式偏移", () => {
    const p = parseSourceDateParts("2026-10-19 (GMT)", SOURCE_DATE_PROFILES.display)!;
    expect(p.hasExplicitOffset).toBe(false);
    expect(p.offsetMinutes).toBeNull();
    expect(p.tzLabel).toBeNull();
    expect(p.d).toBe(19);
  });

  it("年份尾巴不会被误认成偏移（05-Feb-2026 的 -2026）", () => {
    const p = parseSourceDateParts("05-Feb-2026", SOURCE_DATE_PROFILES.display)!;
    expect(p).toMatchObject({ y: 2026, mo: 2, d: 5, offsetMinutes: null, hasExplicitOffset: false });
  });
});

describe("parseSourceDateParts · 策略开关", () => {
  it("meridiem：display 认 AM/PM（12:00 AM → 0 点），classify 不认（按 24h 直读 12 点）", () => {
    expect(parseSourceDateParts("31-Jul-2026 12:00 AM", SOURCE_DATE_PROFILES.display))
      .toMatchObject({ h: 0, mi: 0 });
    expect(parseSourceDateParts("31-Jul-2026 12:00 AM", SOURCE_DATE_PROFILES.classify))
      .toMatchObject({ h: 12, mi: 0 });
  });

  it("isoHour=2：build 对 1 位小时只取日期，display 取到真实时刻", () => {
    expect(parseSourceDateParts("2026-08-20 2:00:00 PM", SOURCE_DATE_PROFILES.build))
      .toMatchObject({ h: null, via: "iso" });
    expect(parseSourceDateParts("2026-08-20 2:00:00 PM", SOURCE_DATE_PROFILES.display))
      .toMatchObject({ h: 14, mi: 0, via: "iso" });
  });

  it("dmonTime=drop：build 丢 D-Mon 时分，classify 保留", () => {
    expect(parseSourceDateParts("31-Dec-2026 23:59", SOURCE_DATE_PROFILES.build))
      .toMatchObject({ h: null, mi: 0, s: 0 });
    expect(parseSourceDateParts("31-Dec-2026 23:59", SOURCE_DATE_PROFILES.classify))
      .toMatchObject({ h: 23, mi: 59 });
  });

  it("leftover：display 拒绝残尾，classify 取前缀", () => {
    expect(parseSourceDateParts("2026-10-19 blah", SOURCE_DATE_PROFILES.display)).toBeNull();
    expect(parseSourceDateParts("2026-10-19 blah", SOURCE_DATE_PROFILES.classify))
      .toMatchObject({ y: 2026, mo: 10, d: 19 });
  });

  it("斜杠日期：build 认（一方 >12 消歧），display/classify 不认", () => {
    expect(parseSourceDateParts("20/07/2026", SOURCE_DATE_PROFILES.build))
      .toMatchObject({ y: 2026, mo: 7, d: 20, via: "slash" });
    expect(parseSourceDateParts("20/07/2026", SOURCE_DATE_PROFILES.display)).toBeNull();
    expect(parseSourceDateParts("20/07/2026", SOURCE_DATE_PROFILES.classify)).toBeNull();
  });

  it("歧义斜杠（两边 ≤12）交 Date.parse 兜底；无 fallback 则 null", () => {
    const p = parseSourceDateParts("07/08/2026", SOURCE_DATE_PROFILES.build)!;
    expect(p.via).toBe("fallback");
    expect(parseSourceDateParts("07/08/2026", SOURCE_DATE_PROFILES.classify)).toBeNull();
  });

  it("数字串：build 直取（>1e11 视为毫秒），其余 profile 不认", () => {
    expect(parseSourceDateParts("1798675200", SOURCE_DATE_PROFILES.build))
      .toMatchObject({ via: "numeric" });
    expect(sourceDateWallSeconds(parseSourceDateParts("1798675200", SOURCE_DATE_PROFILES.build)!))
      .toBe(1798675200);
    expect(parseSourceDateParts("1798675200", SOURCE_DATE_PROFILES.display)).toBeNull();
  });
});

describe("parseSourceDateParts · 不臆造", () => {
  it("空/null/undefined → null", () => {
    expect(parseSourceDateParts("", SOURCE_DATE_PROFILES.display)).toBeNull();
    expect(parseSourceDateParts("   ", SOURCE_DATE_PROFILES.build)).toBeNull();
    expect(parseSourceDateParts(null, SOURCE_DATE_PROFILES.build)).toBeNull();
    expect(parseSourceDateParts(undefined, SOURCE_DATE_PROFILES.build)).toBeNull();
  });

  it("越界月/日 → null（不靠 Date.UTC 归一化）", () => {
    expect(parseSourceDateParts("2026-13-01", SOURCE_DATE_PROFILES.build)).toBeNull();
    expect(parseSourceDateParts("2026-01-32", SOURCE_DATE_PROFILES.build)).toBeNull();
    expect(parseSourceDateParts("31-Xyz-2026", SOURCE_DATE_PROFILES.classify)).toBeNull();
  });

  it("越界时刻 → null（25:00 不归一化成次日）", () => {
    expect(parseSourceDateParts("2026-10-19 25:00", SOURCE_DATE_PROFILES.display)).toBeNull();
    expect(parseSourceDateParts("31-Dec-2026 23:60", SOURCE_DATE_PROFILES.classify)).toBeNull();
  });

  it("点分日期不在识别范围：能解析的只是 Date.parse 兜底（且按 MM/DD 解读，属已知隐患）", () => {
    // 源意多为欧洲 DD.MM.YYYY；V8 的 Date.parse 按美式 MM/DD 解读 → 3 月 8 日（应为 8 月 3 日）。
    // 阶段 1+2 保留旧行为（金样 zero-diff），阶段 3 需单独决策是否识别点分格式。
    const p = parseSourceDateParts("03.08.2026 10:00:00", SOURCE_DATE_PROFILES.build)!;
    expect(p.via).toBe("fallback");
    expect(parseSourceDateParts("31.07.2026 8:00:00", SOURCE_DATE_PROFILES.build)).toBeNull();
  });

  it("兜底结果不随宿主时区漂移：墙上时间按 UTC 编码", () => {
    // 2026-11-13 CI（UTC）与本地（+08）差整 8 小时，金样回归当场炸出。
    // 同一串必须给出同一个秒数，否则 published_ts 会随部署机器改值。
    const p = parseSourceDateParts("03.08.2026 10:00:00", SOURCE_DATE_PROFILES.build)!;
    expect(sourceDateWallSeconds(p)).toBe(Math.floor(Date.UTC(2026, 2, 8, 10, 0, 0) / 1000));
  });
});
