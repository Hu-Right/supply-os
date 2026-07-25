import { describe, it, expect } from "vitest";
import { pickLocale } from "@/core/i18n/pickLocale";

describe("pickLocale", () => {
  it('returns zh value when locale is "zh"', () => {
    expect(pickLocale("zh", "中文", "English")).toBe("中文");
  });

  it('returns en value when locale is "en"', () => {
    expect(pickLocale("en", "中文", "English")).toBe("English");
  });

  it("returns en value for unknown locale (fallback)", () => {
    expect(pickLocale("fr", "中文", "English")).toBe("English");
    expect(pickLocale("ja", "中文", "English")).toBe("English");
  });

  it("returns en value for empty string locale", () => {
    expect(pickLocale("", "中文", "English")).toBe("English");
  });
});
