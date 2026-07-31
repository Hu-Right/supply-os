import { describe, it, expect } from "vitest";
import { getUnspscOptionLabel } from "@/core/unspsc";

// UNSPSC 级联选项文案策略：只展示按语言选择的标题，编码不进入选项文案
describe("getUnspscOptionLabel", () => {
  it("returns the Chinese title only (no code) for zh locale", () => {
    expect(
      getUnspscOptionLabel({ id: 1, code: "10000000", title_zh: "燃料", title_en: "Fuel" }, "zh")
    ).toBe("燃料");
  });

  it("falls back to the English title for non-zh locales, still without code", () => {
    expect(
      getUnspscOptionLabel({ id: 1, code: "10000000", title_zh: "燃料", title_en: "Fuel" }, "fr")
    ).toBe("Fuel");
  });

  it("falls back through title/name chains when localized titles are missing", () => {
    expect(getUnspscOptionLabel({ id: 1, code: "10000000", title: "Fuel" }, "zh")).toBe("Fuel");
    expect(getUnspscOptionLabel({ id: 1, code: "10000000", name: "Fuel" }, "en")).toBe("Fuel");
  });

  it("degrades to the raw code only when no title exists at all", () => {
    expect(getUnspscOptionLabel({ id: 1, code: "10000000" }, "zh")).toBe("10000000");
  });

  it("uses the placeholder when neither title nor code is available", () => {
    expect(getUnspscOptionLabel({ id: 1, code: "" }, "zh")).toBe("Unnamed category");
  });

  it("prefers title_i18n over title_en for non-zh locales", () => {
    const item = {
      id: 1,
      code: "10000000",
      title: "Live Plant and Animal Material",
      title_zh: "活体动植物",
      title_i18n: "Matériel végétal et animal vivant",
    };
    expect(getUnspscOptionLabel(item, "fr")).toBe("Matériel végétal et animal vivant");
    // zh 不受 title_i18n 影响
    expect(getUnspscOptionLabel(item, "zh")).toBe("活体动植物");
    // title_i18n 为空时回退 title_en → title 链
    expect(getUnspscOptionLabel({ ...item, title_i18n: null }, "fr")).toBe(
      "Live Plant and Animal Material"
    );
  });
});
