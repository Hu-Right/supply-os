import { describe, it, expect } from "vitest";
import { pickLocale } from "./pickLocale";

describe("pickLocale", () => {
  it("zh locale → 返回中文值", () => {
    expect(pickLocale("zh", "中文", "English")).toBe("中文");
  });

  it("en locale → 返回英文值", () => {
    expect(pickLocale("en", "中文", "English")).toBe("English");
  });

  it("其他 locale → 返回英文值（兜底）", () => {
    expect(pickLocale("fr", "中文", "English")).toBe("English");
    expect(pickLocale("ja", "中文", "English")).toBe("English");
  });

  it("支持非字符串类型", () => {
    expect(pickLocale("zh", 42, 99)).toBe(42);
    expect(pickLocale("en", 42, 99)).toBe(99);
    expect(pickLocale("zh", true, false)).toBe(true);
  });
});
