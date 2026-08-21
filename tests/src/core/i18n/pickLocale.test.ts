/**
 * src/core/i18n/pickLocale.ts 测试
 */
import { describe, it, expect } from "vitest";
import { pickLocale } from "../../../../src/core/i18n/pickLocale";

describe("pickLocale", () => {
  it("zh locale 返回 zh 值", () => {
    expect(pickLocale("zh", "中文", "English")).toBe("中文");
  });

  it("en locale 返回 en 值", () => {
    expect(pickLocale("en", "中文", "English")).toBe("English");
  });

  it("其他 locale 返回 en 值", () => {
    expect(pickLocale("fr", "中文", "English")).toBe("English");
    expect(pickLocale("es", "中文", "English")).toBe("English");
  });

  it("支持非字符串类型", () => {
    expect(pickLocale("zh", 1, 2)).toBe(1);
    expect(pickLocale("en", 1, 2)).toBe(2);
  });
});
