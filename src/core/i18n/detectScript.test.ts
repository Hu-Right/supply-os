import { describe, it, expect } from "vitest";
import { detectDominantScript, needsContentTranslation } from "./detectScript";

describe("detectDominantScript", () => {
  it("纯中文 → cjk", () => {
    expect(detectDominantScript("这是一个中文标题")).toBe("cjk");
  });

  it("纯英文 → latin", () => {
    expect(detectDominantScript("This is an English title")).toBe("latin");
  });

  it("纯俄文 → cyrillic", () => {
    expect(detectDominantScript("Это русский текст")).toBe("cyrillic");
  });

  it("纯阿拉伯文 → arabic", () => {
    expect(detectDominantScript("هذا نص عربي")).toBe("arabic");
  });

  it("混合中英文（拉丁字符主导）→ latin", () => {
    // "这是 Chinese 和 English 混合文本" 中拉丁字母数量多于 CJK
    expect(detectDominantScript("这是 Chinese 和 English 混合文本")).toBe("latin");
  });

  it("纯数字/符号 → unknown", () => {
    expect(detectDominantScript("12345!@#$%")).toBe("unknown");
  });

  it("空字符串 → unknown", () => {
    expect(detectDominantScript("")).toBe("unknown");
  });
});

describe("needsContentTranslation", () => {
  it("中文文本 + zh locale → 不需要翻译", () => {
    expect(needsContentTranslation("中文标题", "zh")).toBe(false);
  });

  it("中文文本 + en locale → 需要翻译", () => {
    expect(needsContentTranslation("中文标题", "en")).toBe(true);
  });

  it("英文文本 + en locale → 需要翻译（latin 语种交后端 tinyld 判断）", () => {
    // latin 语种不可确定是否为同一语言，一律交后端处理
    expect(needsContentTranslation("English title", "en")).toBe(true);
  });

  it("英文文本 + zh locale → 需要翻译", () => {
    expect(needsContentTranslation("English title", "zh")).toBe(true);
  });

  it("纯数字 → 不翻译", () => {
    expect(needsContentTranslation("12345", "en")).toBe(false);
  });

  it("未知 locale → 不翻译（保守策略）", () => {
    expect(needsContentTranslation("some text", "xx")).toBe(false);
  });
});
