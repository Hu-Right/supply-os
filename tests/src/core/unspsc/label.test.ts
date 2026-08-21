/**
 * src/core/unspsc/label.ts 测试
 */
import { describe, it, expect } from "vitest";
import { getUnspscOptionLabel } from "../../../../src/core/unspsc/label";
import type { UnspscOption } from "../../../../src/core/unspsc/types";

function makeOption(overrides: Partial<UnspscOption> = {}): UnspscOption {
  return {
    id: 1,
    code: "001",
    name: "Test",
    title: "Test Title",
    title_zh: "测试标题",
    title_en: "Test Title EN",
    title_i18n: undefined,
    ...overrides,
  };
}

describe("getUnspscOptionLabel", () => {
  it("zh locale 优先 title_zh", () => {
    const opt = makeOption({ title_zh: "中文标题", title_en: "English" });
    expect(getUnspscOptionLabel(opt, "zh")).toBe("中文标题");
  });

  it("zh locale 无 title_zh 时回退 title", () => {
    const opt = makeOption({ title_zh: undefined, title: "Fallback" });
    expect(getUnspscOptionLabel(opt, "zh")).toBe("Fallback");
  });

  it("非 zh locale 优先 title_i18n", () => {
    const opt = makeOption({ title_i18n: "Titre FR", title_en: "English" });
    expect(getUnspscOptionLabel(opt, "fr")).toBe("Titre FR");
  });

  it("非 zh locale 无 title_i18n 回退 title_en", () => {
    const opt = makeOption({ title_i18n: undefined, title_en: "English" });
    expect(getUnspscOptionLabel(opt, "en")).toBe("English");
  });

  it("全部为空时回退 code", () => {
    const opt = makeOption({
      code: "42000000",
      name: "",
      title: "",
      title_zh: undefined,
      title_en: undefined,
      title_i18n: undefined,
    });
    expect(getUnspscOptionLabel(opt, "zh")).toBe("42000000");
  });

  it("完全空对象返回 Unnamed category", () => {
    const opt = { code: "", name: "", title: "" } as any;
    expect(getUnspscOptionLabel(opt, "zh")).toBe("Unnamed category");
  });
});
