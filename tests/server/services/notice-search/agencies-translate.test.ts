/**
 * server/services/notice-search/agencies/translate.ts 补充测试
 * 覆盖 needsTranslationFix + buildZhFromKeywords + extractCountryFromName
 */
import { describe, it, expect } from "vitest";
import {
  needsTranslationFix, buildZhFromKeywords, extractCountryFromName,
} from "../../../../server/services/notice-search/agencies/translate";

describe("needsTranslationFix", () => {
  it("undefined → 需要修复", () => {
    expect(needsTranslationFix(undefined, "Test Agency")).toBe(true);
  });

  it("翻译等于原名 → 需要修复", () => {
    expect(needsTranslationFix("UNDP", "UNDP")).toBe(true);
  });

  it("英文字母多于中文 → 需要修复", () => {
    expect(needsTranslationFix("United Nations Development Programme", "UNDP")).toBe(true);
  });

  it("含 4+ 连续英文字母 → 需要修复", () => {
    expect(needsTranslationFix("联合国UNDP机构", "UNDP")).toBe(true);
  });

  it("纯中文翻译 → 不需要修复", () => {
    expect(needsTranslationFix("联合国开发计划署", "UNDP")).toBe(false);
  });

  it("空字符串 → 需要修复", () => {
    expect(needsTranslationFix("", "UNDP")).toBe(true);
  });
});

describe("buildZhFromKeywords", () => {
  it("Commission → 委员会", () => {
    expect(buildZhFromKeywords("European Commission")).toBe("委员会");
  });

  it("Ministry → 部", () => {
    expect(buildZhFromKeywords("Ministry of Education")).toBe("部");
  });

  it("University → 大学", () => {
    expect(buildZhFromKeywords("Harbin University")).toBe("大学");
  });

  it("Bank → 银行", () => {
    expect(buildZhFromKeywords("World Bank")).toBe("银行");
  });

  it("无匹配关键词 → null", () => {
    expect(buildZhFromKeywords("XYZ Organization")).toBeNull();
  });
});

describe("extractCountryFromName", () => {
  it("包含国家名 → 返回中文名", () => {
    expect(extractCountryFromName("Ministry of BRAZIL Education")).toBe("巴西");
    expect(extractCountryFromName("KENYA National Bureau")).toBe("肯尼亚");
  });

  it("ISO 代码匹配 → 返回中文名", () => {
    expect(extractCountryFromName("GOV.CN")).toBe("中国");
    expect(extractCountryFromName("agency_US")).toBe("美国");
  });

  it("无匹配 → null", () => {
    expect(extractCountryFromName("Some Random Agency")).toBeNull();
  });

  it("BURMA → 缅甸", () => {
    expect(extractCountryFromName("BURMA Ministry")).toBe("缅甸");
  });

  it("HOLLAND → 荷兰", () => {
    expect(extractCountryFromName("HOLLAND Agency")).toBe("荷兰");
  });
});
