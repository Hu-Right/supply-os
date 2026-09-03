import { describe, it, expect } from "vitest";
import { safeJson, preferValue } from "@/lib/utils/json";

describe("safeJson", () => {
  it("合法 JSON 字符串 → 解析结果", () => {
    expect(safeJson('{"a":1}')).toEqual({ a: 1 });
    expect(safeJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("已经是数组 → 直接返回", () => {
    const arr = [1, 2];
    expect(safeJson(arr)).toBe(arr);
  });

  it("非法 JSON → 空数组", () => {
    expect(safeJson("not json")).toEqual([]);
    expect(safeJson("{broken")).toEqual([]);
  });

  it("null/undefined → 空数组", () => {
    expect(safeJson(null)).toEqual([]);
    expect(safeJson(undefined)).toEqual([]);
    expect(safeJson("")).toEqual([]);
  });
});

describe("preferValue", () => {
  it("primary 有值 → 返回 primary", () => {
    expect(preferValue("hello", "fallback")).toBe("hello");
    expect(preferValue(0, "fallback")).toBe(0);
    expect(preferValue(false, "fallback")).toBe(false);
  });

  it("primary 为 null/undefined/空字符串 → 返回 fallback", () => {
    expect(preferValue(null, "fallback")).toBe("fallback");
    expect(preferValue(undefined, "fallback")).toBe("fallback");
    expect(preferValue("", "fallback")).toBe("fallback");
  });

  it("primary 为空数组 → 返回 fallback", () => {
    expect(preferValue([], "fallback")).toBe("fallback");
  });

  it("primary 为非空数组 → 返回 primary", () => {
    expect(preferValue([1], "fallback")).toEqual([1]);
  });
});
