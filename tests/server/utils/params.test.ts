/**
 * server/utils/params.ts 测试
 */
import { describe, it, expect } from "vitest";
import type { ParsedQs } from "qs";
import { parseOptionalInt, parseOptionalString } from "../../../server/utils/params";

describe("parseOptionalInt", () => {
  it("正常整数解析", () => {
    const q: ParsedQs = { page: "5", size: "20" };
    expect(parseOptionalInt(q, "page", 1, 1000, 1)).toBe(5);
    expect(parseOptionalInt(q, "size", 1, 100, 10)).toBe(20);
  });

  it("缺失参数返回 fallback", () => {
    const q: ParsedQs = {};
    expect(parseOptionalInt(q, "page", 1, 1000, 1)).toBe(1);
  });

  it("非数字返回 fallback", () => {
    const q: ParsedQs = { page: "abc" };
    expect(parseOptionalInt(q, "page", 1, 1000, 1)).toBe(1);
  });

  it("clamp 到 [min, max]", () => {
    const q: ParsedQs = { page: "9999" };
    expect(parseOptionalInt(q, "page", 1, 100, 1)).toBe(100);

    const q2: ParsedQs = { page: "-5" };
    expect(parseOptionalInt(q2, "page", 1, 100, 1)).toBe(1);
  });

  it("浮点数向下取整", () => {
    const q: ParsedQs = { val: "3.7" };
    expect(parseOptionalInt(q, "val", 0, 100, 0)).toBe(3);
  });

  it("NaN 返回 fallback", () => {
    const q: ParsedQs = { val: "NaN" };
    expect(parseOptionalInt(q, "val", 0, 100, 0)).toBe(0);
  });
});

describe("parseOptionalString", () => {
  it("正常字符串", () => {
    const q: ParsedQs = { q: "hello" };
    expect(parseOptionalString(q, "q")).toBe("hello");
  });

  it("自动 trim", () => {
    const q: ParsedQs = { q: "  hello  " };
    expect(parseOptionalString(q, "q")).toBe("hello");
  });

  it("缺失返回空字符串", () => {
    const q: ParsedQs = {};
    expect(parseOptionalString(q, "q")).toBe("");
  });

  it("截断超长字符串", () => {
    const q: ParsedQs = { q: "a".repeat(300) };
    expect(parseOptionalString(q, "q", 10).length).toBe(10);
  });
});
