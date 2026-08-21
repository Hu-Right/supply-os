/**
 * src/core/i18n/detectScript.ts 测试
 */
import { describe, it, expect } from "vitest";
import { detectDominantScript, needsContentTranslation } from "../../../../src/core/i18n/detectScript";

describe("detectDominantScript", () => {
  it("CJK 文本", () => {
    expect(detectDominantScript("这是一个中文测试文本")).toBe("cjk");
  });

  it("Latin 文本", () => {
    expect(detectDominantScript("This is an English text")).toBe("latin");
  });

  it("Cyrillic 文本", () => {
    expect(detectDominantScript("Это русский текст")).toBe("cyrillic");
  });

  it("Arabic 文本", () => {
    expect(detectDominantScript("هذا نص عربي")).toBe("arabic");
  });

  it("纯数字/符号返回 unknown", () => {
    expect(detectDominantScript("12345!@#$%")).toBe("unknown");
  });

  it("空字符串返回 unknown", () => {
    expect(detectDominantScript("")).toBe("unknown");
  });

  it("混合文本按占比判定", () => {
    // 大部分 CJK + 少量 Latin（CJK 字符数 > Latin 字符数）
    expect(detectDominantScript("这是一个中文测试文本abc")).toBe("cjk");
    // 大部分 Latin + 少量 CJK
    expect(detectDominantScript("English text with 中文")).toBe("latin");
  });
});

describe("needsContentTranslation", () => {
  it("中文文本在中文环境不需要翻译", () => {
    expect(needsContentTranslation("这是一个中文公告", "zh")).toBe(false);
  });

  it("中文文本在英文环境需要翻译", () => {
    expect(needsContentTranslation("这是一个中文公告", "en")).toBe(true);
  });

  it("英文文本在英文环境不需要翻译", () => {
    expect(needsContentTranslation("This is English text", "en")).toBe(true);
    // latin 语种不可确定（en/fr/es 同属拉丁），需交后端
  });

  it("纯数字/符号不翻译", () => {
    expect(needsContentTranslation("12345", "zh")).toBe(false);
    expect(needsContentTranslation("!@#$%", "en")).toBe(false);
  });

  it("未知 locale 返回 false", () => {
    expect(needsContentTranslation("text", "xx")).toBe(false);
  });

  it("西里尔文本在中文环境需要翻译", () => {
    expect(needsContentTranslation("Русский текст", "zh")).toBe(true);
  });
});
