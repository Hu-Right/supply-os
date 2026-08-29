import { describe, it, expect } from "vitest";
import { normalizeUnspscCodes, unspscPrefixFromCode, expandUnspscInterestPrefixes, padUnspscPrefix } from "./parser";

describe("normalizeUnspscCodes", () => {
  it("从对象数组提取码", () => {
    const result = normalizeUnspscCodes([{ code: "12345678", name: "Test" }]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].code).toBeTruthy();
  });

  it("从 JSON 字符串解析", () => {
    const json = JSON.stringify([{ code: "1234", name: "Item" }]);
    const result = normalizeUnspscCodes(json);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("空值 → 空数组", () => {
    expect(normalizeUnspscCodes(null)).toEqual([]);
    expect(normalizeUnspscCodes("")).toEqual([]);
  });

  it("最多 20 条", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ code: String(i).padStart(8, "0"), name: `Item ${i}` }));
    const result = normalizeUnspscCodes(items);
    expect(result.length).toBeLessThanOrEqual(20);
  });
});

describe("unspscPrefixFromCode", () => {
  it("去除尾部 00 段", () => {
    expect(unspscPrefixFromCode("12340000")).toBe("1234");
    expect(unspscPrefixFromCode("12000000")).toBe("12");
  });

  it("无尾部 00 → 全码", () => {
    expect(unspscPrefixFromCode("12345678")).toBe("12345678");
  });

  it("空码 → 空字符串", () => {
    expect(unspscPrefixFromCode("")).toBe("");
    expect(unspscPrefixFromCode("abc")).toBe("");
  });

  it("仅数字部分有效", () => {
    expect(unspscPrefixFromCode("AB12340000")).toBe("1234");
  });
});

describe("expandUnspscInterestPrefixes", () => {
  it("展开所有层级前缀", () => {
    const prefixes = expandUnspscInterestPrefixes("12345678");
    expect(prefixes).toContain("12");
    expect(prefixes).toContain("1234");
    expect(prefixes).toContain("123456");
    expect(prefixes).toContain("12345678");
  });

  it("尾部 00 截断后展开", () => {
    const prefixes = expandUnspscInterestPrefixes("12340000");
    expect(prefixes).toContain("12");
    expect(prefixes).toContain("1234");
    expect(prefixes).not.toContain("123400");
  });

  it("空码 → 空数组", () => {
    expect(expandUnspscInterestPrefixes("")).toEqual([]);
  });
});

describe("padUnspscPrefix", () => {
  it("短前缀补 0 至 8 位", () => {
    expect(padUnspscPrefix("12")).toBe("12000000");
    expect(padUnspscPrefix("1234")).toBe("12340000");
  });

  it("8 位前缀 → 不变", () => {
    expect(padUnspscPrefix("12345678")).toBe("12345678");
  });

  it("空值 → 全 0", () => {
    expect(padUnspscPrefix("")).toBe("00000000");
  });
});
