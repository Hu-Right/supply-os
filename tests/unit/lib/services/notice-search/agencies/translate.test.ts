import { describe, it, expect } from "vitest";
import { needsTranslationFix, buildZhFromKeywords, extractCountryFromName } from "@/lib/services/notice-search/agencies/translate";

describe("needsTranslationFix", () => {
  it("undefined → true", () => {
    expect(needsTranslationFix(undefined, "UNDP")).toBe(true);
  });

  it("翻译 === 机构名 → true（无意义翻译）", () => {
    expect(needsTranslationFix("UNDP", "UNDP")).toBe(true);
  });

  it("英文字符 > 中文字符 → true（翻译偏英文）", () => {
    expect(needsTranslationFix("United Nations Dev", "UNDP")).toBe(true);
  });

  it("含 4+ 连续英文字母 → true", () => {
    expect(needsTranslationFix("联合国Development Programme", "UNDP")).toBe(true);
  });

  it("纯中文 → false", () => {
    expect(needsTranslationFix("联合国开发计划署", "UNDP")).toBe(false);
  });
});

describe("buildZhFromKeywords", () => {
  it("Committee → 委员会", () => {
    expect(buildZhFromKeywords("National Planning Committee")).toBe("委员会");
  });

  it("Ministry → 部", () => {
    expect(buildZhFromKeywords("Ministry of Finance")).toBe("部");
  });

  it("University → 大学", () => {
    expect(buildZhFromKeywords("Harbin University")).toBe("大学");
  });

  it("无匹配关键词 → null", () => {
    expect(buildZhFromKeywords("Random Organization")).toBeNull();
  });
});

describe("extractCountryFromName", () => {
  it("含 CHINA → 中国", () => {
    expect(extractCountryFromName("Ministry of CHINA Finance")).toBe("中国");
  });

  it("含 BRAZIL → 巴西", () => {
    expect(extractCountryFromName("Brazil National Bank")).toBe("巴西");
  });

  it("含 JAPAN → 日本", () => {
    expect(extractCountryFromName("JAPAN Water Authority")).toBe("日本");
  });

  it("无国家关键词 → null", () => {
    expect(extractCountryFromName("International Committee")).toBeNull();
  });

  it("GOV 后缀匹配 → 国家", () => {
    expect(extractCountryFromName("AGENCY.GOV.BR")).toBe("巴西");
  });
});
