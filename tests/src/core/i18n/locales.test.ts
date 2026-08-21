/**
 * src/core/i18n/locales.ts 测试
 */
import { describe, it, expect } from "vitest";
import { SUPPORTED_LOCALES, SUPPORTED_LOCALE_CODES, getLocaleDir } from "../../../../src/core/i18n/locales";

describe("SUPPORTED_LOCALES", () => {
  it("包含 6 种联合国官方语言", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(6);
  });

  it("包含 zh/en/fr/ru/es/ar", () => {
    const codes = SUPPORTED_LOCALES.map((l) => l.code);
    expect(codes).toEqual(["zh", "en", "fr", "ru", "es", "ar"]);
  });

  it("每种语言都有 nativeName 和 englishName", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(locale.nativeName).toBeTruthy();
      expect(locale.englishName).toBeTruthy();
    }
  });

  it("阿拉伯语为 rtl，其余为 ltr", () => {
    for (const locale of SUPPORTED_LOCALES) {
      if (locale.code === "ar") {
        expect(locale.dir).toBe("rtl");
      } else {
        expect(locale.dir).toBe("ltr");
      }
    }
  });
});

describe("SUPPORTED_LOCALE_CODES", () => {
  it("为 SUPPORTED_LOCALES 的 code 数组", () => {
    expect(SUPPORTED_LOCALE_CODES).toEqual(["zh", "en", "fr", "ru", "es", "ar"]);
  });
});

describe("getLocaleDir", () => {
  it("中文为 ltr", () => {
    expect(getLocaleDir("zh")).toBe("ltr");
  });

  it("阿拉伯语为 rtl", () => {
    expect(getLocaleDir("ar")).toBe("rtl");
  });

  it("英文为 ltr", () => {
    expect(getLocaleDir("en")).toBe("ltr");
  });

  it("未知语言默认 ltr", () => {
    expect(getLocaleDir("xx")).toBe("ltr");
    expect(getLocaleDir("")).toBe("ltr");
  });
});
