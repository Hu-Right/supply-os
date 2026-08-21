/**
 * server/utils/json.ts 测试
 */
import { describe, it, expect } from "vitest";
import { safeJson, preferValue } from "../../../server/utils/json";

describe("safeJson", () => {
  it("空值返回空数组", () => {
    expect(safeJson(null)).toEqual([]);
    expect(safeJson(undefined)).toEqual([]);
    expect(safeJson("")).toEqual([]);
    expect(safeJson(0)).toEqual([]);
  });

  it("数组直接返回", () => {
    const arr = [1, 2, 3];
    expect(safeJson(arr)).toBe(arr);
  });

  it("合法 JSON 字符串解析", () => {
    expect(safeJson('[1,2]')).toEqual([1, 2]);
    expect(safeJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("非法 JSON 字符串返回空数组", () => {
    expect(safeJson("not json")).toEqual([]);
    expect(safeJson("{broken")).toEqual([]);
  });
});

describe("preferValue", () => {
  it("primary 有效时返回 primary", () => {
    expect(preferValue("hello", "fallback")).toBe("hello");
    expect(preferValue(0, "fallback")).toBe(0);
    expect(preferValue(false, "fallback")).toBe(false);
    expect(preferValue([1], "fallback")).toEqual([1]);
  });

  it("primary 为 null/undefined/空字符串/空数组 时返回 fallback", () => {
    expect(preferValue(null, "fb")).toBe("fb");
    expect(preferValue(undefined, "fb")).toBe("fb");
    expect(preferValue("", "fb")).toBe("fb");
    expect(preferValue([], "fb")).toBe("fb");
  });
});
