import { describe, it, expect } from "vitest";
import {
  SUPPORTED_LOCALES,
  SUPPORTED_LOCALE_CODES,
  getLocaleDir,
} from "@/core/i18n/locales";

describe("SUPPORTED_LOCALES", () => {
  it("contains 6 UN official languages", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(6);
  });

  it("includes zh and en as first two locales", () => {
    expect(SUPPORTED_LOCALES[0].code).toBe("zh");
    expect(SUPPORTED_LOCALES[1].code).toBe("en");
  });

  it("each locale has required properties", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(locale.code).toBeTruthy();
      expect(locale.nativeName).toBeTruthy();
      expect(locale.englishName).toBeTruthy();
      expect(locale.dir).toMatch(/^(ltr|rtl)$/);
    }
  });

  it("Arabic is the only RTL language", () => {
    const rtlLocales = SUPPORTED_LOCALES.filter((l) => l.dir === "rtl");
    expect(rtlLocales).toHaveLength(1);
    expect(rtlLocales[0].code).toBe("ar");
  });

  it("all other languages are LTR", () => {
    const ltrLocales = SUPPORTED_LOCALES.filter((l) => l.dir === "ltr");
    expect(ltrLocales).toHaveLength(5);
  });

  it("native names are correct", () => {
    const nativeNames = SUPPORTED_LOCALES.map((l) => l.nativeName);
    expect(nativeNames).toContain("中文");
    expect(nativeNames).toContain("English");
    expect(nativeNames).toContain("Français");
    expect(nativeNames).toContain("Русский");
    expect(nativeNames).toContain("Español");
    expect(nativeNames).toContain("العربية");
  });
});

describe("SUPPORTED_LOCALE_CODES", () => {
  it("is an array of 6 locale codes", () => {
    expect(SUPPORTED_LOCALE_CODES).toHaveLength(6);
  });

  it("contains all expected locale codes", () => {
    expect(SUPPORTED_LOCALE_CODES).toContain("zh");
    expect(SUPPORTED_LOCALE_CODES).toContain("en");
    expect(SUPPORTED_LOCALE_CODES).toContain("fr");
    expect(SUPPORTED_LOCALE_CODES).toContain("ru");
    expect(SUPPORTED_LOCALE_CODES).toContain("es");
    expect(SUPPORTED_LOCALE_CODES).toContain("ar");
  });

  it("matches the codes from SUPPORTED_LOCALES", () => {
    const codes = SUPPORTED_LOCALES.map((l) => l.code);
    expect(SUPPORTED_LOCALE_CODES).toEqual(codes);
  });
});

describe("getLocaleDir", () => {
  it("returns ltr for Chinese", () => {
    expect(getLocaleDir("zh")).toBe("ltr");
  });

  it("returns ltr for English", () => {
    expect(getLocaleDir("en")).toBe("ltr");
  });

  it("returns ltr for French", () => {
    expect(getLocaleDir("fr")).toBe("ltr");
  });

  it("returns ltr for Russian", () => {
    expect(getLocaleDir("ru")).toBe("ltr");
  });

  it("returns ltr for Spanish", () => {
    expect(getLocaleDir("es")).toBe("ltr");
  });

  it("returns rtl for Arabic", () => {
    expect(getLocaleDir("ar")).toBe("rtl");
  });

  it("returns ltr for unknown locale (default)", () => {
    expect(getLocaleDir("unknown")).toBe("ltr");
  });

  it("returns ltr for empty string", () => {
    expect(getLocaleDir("")).toBe("ltr");
  });

  it("is case-sensitive", () => {
    expect(getLocaleDir("ZH")).toBe("ltr");
    expect(getLocaleDir("EN")).toBe("ltr");
  });
});
