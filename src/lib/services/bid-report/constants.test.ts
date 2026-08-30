import { describe, it, expect } from "vitest";
import { safe, safeObj, PLATFORMS, INDUSTRY_MAP, SONG, HEI, NAVY } from "./constants";

describe("safe", () => {
  it("null/undefined/false/空串 → 空串", () => {
    expect(safe(null)).toBe("");
    expect(safe(undefined)).toBe("");
    expect(safe(false)).toBe("");
    expect(safe("")).toBe("");
  });

  it("有值 → String(v)", () => {
    expect(safe("hello")).toBe("hello");
    expect(safe(42)).toBe("42");
    expect(safe(0)).toBe("0");
  });
});

describe("safeObj", () => {
  it("对象 → 直通", () => {
    const obj = { a: 1 };
    expect(safeObj(obj)).toBe(obj);
  });

  it("合法 JSON 字符串 → 解析", () => {
    expect(safeObj('{"a":1}')).toEqual({ a: 1 });
  });

  it("非法 JSON → 空对象", () => {
    expect(safeObj("not json")).toEqual({});
  });

  it("数组 → 空对象", () => {
    expect(safeObj([1, 2])).toEqual({});
  });

  it("null → 空对象", () => {
    expect(safeObj(null)).toEqual({});
  });
});

describe("常量", () => {
  it("PLATFORMS 包含主要平台", () => {
    expect(PLATFORMS.ungm).toContain("UNGM");
    expect(PLATFORMS.worldbank).toContain("World Bank");
  });

  it("INDUSTRY_MAP 包含主要行业", () => {
    expect(INDUSTRY_MAP.medical).toContain("医疗");
    expect(INDUSTRY_MAP.it).toContain("信息");
  });

  it("字体常量", () => {
    expect(SONG.ascii).toBe("宋体");
    expect(HEI.ascii).toBe("黑体");
    expect(NAVY).toBe("1F3864");
  });
});
