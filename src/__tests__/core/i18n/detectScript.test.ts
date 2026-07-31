import { describe, it, expect } from "vitest";
import { needsContentTranslation, detectDominantScript } from "../../../core/i18n/detectScript";

describe("detectDominantScript", () => {
  it("detects cjk / cyrillic / arabic / latin", () => {
    expect(detectDominantScript("采购水泵及配件")).toBe("cjk");
    expect(detectDominantScript("Поставка насосов")).toBe("cyrillic");
    expect(detectDominantScript("توريد المضخات")).toBe("arabic");
    expect(detectDominantScript("Supply of pumps")).toBe("latin");
  });

  it("returns unknown for numeric/symbol only text", () => {
    expect(detectDominantScript("2026-08-15 / #42")).toBe("unknown");
  });
});

describe("needsContentTranslation", () => {
  it("requests translation for latin source under en locale (server decides)", () => {
    // 法语原文在 en 环境：字符级不可判语种，交后端 tinyld 全文检测
    expect(needsContentTranslation("Fourniture de pompes hydrauliques", "en")).toBe(true);
  });

  it("requests translation for unknown scripts (e.g. Thai)", () => {
    // 泰文等区间盲区含字母：保守请求，后端 passthrough 零 API 成本
    expect(needsContentTranslation("จัดซื้อเครื่องสูบน้ำ", "en")).toBe(true);
  });

  it("still skips when source script equals unique target script", () => {
    expect(needsContentTranslation("采购水泵及配件", "zh")).toBe(false);
    expect(needsContentTranslation("Поставка насосов", "ru")).toBe(false);
    expect(needsContentTranslation("توريد المضخات", "ar")).toBe(false);
  });

  it("skips pure numeric/symbol content", () => {
    expect(needsContentTranslation("2026-08-15 / #42", "zh")).toBe(false);
  });

  it("requests reverse translation when scripts differ", () => {
    expect(needsContentTranslation("采购水泵及配件", "en")).toBe(true);
    expect(needsContentTranslation("Supply of pumps", "zh")).toBe(true);
  });

  it("returns false for unsupported target locale", () => {
    expect(needsContentTranslation("Supply of pumps", "xx")).toBe(false);
  });
});
