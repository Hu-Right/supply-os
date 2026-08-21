/**
 * server/data/countryNames.ts 测试
 */
import { describe, it, expect } from "vitest";
import {
  cleanCountryRaw,
  getCountryDisplayName,
  getCountryEnglishName,
  COUNTRY_NAME_ZH,
  ZH_TO_EN,
} from "../../../server/data/countryNames";

describe("cleanCountryRaw", () => {
  it("剥离斜杠前缀", () => {
    expect(cleanCountryRaw("/，Basilan")).toBe("Basilan");
    expect(cleanCountryRaw("/, test")).toBe("test");
  });

  it("剥离前导标点", () => {
    expect(cleanCountryRaw(",Brazil")).toBe("Brazil");
    expect(cleanCountryRaw(";Germany")).toBe("Germany");
  });

  it("正常值不变", () => {
    expect(cleanCountryRaw("Brazil")).toBe("Brazil");
    expect(cleanCountryRaw("United States")).toBe("United States");
  });

  it("trim 空白", () => {
    expect(cleanCountryRaw("  China  ")).toBe("China");
  });
});

describe("getCountryDisplayName", () => {
  it("中文环境返回中文名", () => {
    expect(getCountryDisplayName("Brazil", "zh")).toBe("巴西");
    expect(getCountryDisplayName("United States", "zh")).toBe("美国");
    expect(getCountryDisplayName("Japan", "zh")).toBe("日本");
  });

  it("非中文环境返回英文原名", () => {
    expect(getCountryDisplayName("Brazil", "en")).toBe("Brazil");
    expect(getCountryDisplayName("Japan", "fr")).toBe("Japan");
  });

  it("大小写不敏感匹配", () => {
    expect(getCountryDisplayName("america", "zh")).toBe("美国");
    expect(getCountryDisplayName("RUS", "zh")).toBe("俄罗斯");
  });

  it("未知国家名原样返回", () => {
    expect(getCountryDisplayName("Atlantis", "zh")).toBe("Atlantis");
    expect(getCountryDisplayName("Atlantis", "en")).toBe("Atlantis");
  });

  it("逗号分隔区域解析", () => {
    const result = getCountryDisplayName("Canada, British Columbia", "zh");
    expect(result).toContain("加拿大");
  });

  it("区域在前格式解析", () => {
    const result = getCountryDisplayName("British Columbia, Canada", "zh");
    expect(result).toContain("加拿大");
  });

  it("区域不在映射中保留英文", () => {
    const result = getCountryDisplayName("Brazil, Unknown Region", "zh");
    expect(result).toContain("巴西");
    expect(result).toContain("Unknown Region");
  });

  it("无法匹配国家时返回原文", () => {
    const result = getCountryDisplayName("Unknown1, Unknown2", "zh");
    expect(result).toBe("Unknown1, Unknown2");
  });
});

describe("getCountryEnglishName", () => {
  it("中文名返回英文名", () => {
    expect(getCountryEnglishName("英国")).toBe("United Kingdom");
    expect(getCountryEnglishName("美国")).toBe("United States");
    expect(getCountryEnglishName("日本")).toBe("Japan");
  });

  it("已是英文名直接返回", () => {
    expect(getCountryEnglishName("Brazil")).toBe("Brazil");
    expect(getCountryEnglishName("Germany")).toBe("Germany");
  });
});

describe("COUNTRY_NAME_ZH 映射表", () => {
  it("包含主要国家", () => {
    expect(COUNTRY_NAME_ZH["China"]).toBe("中国");
    expect(COUNTRY_NAME_ZH["United States"]).toBe("美国");
    expect(COUNTRY_NAME_ZH["Brazil"]).toBe("巴西");
  });

  it("包含变体名", () => {
    expect(COUNTRY_NAME_ZH["Brasil"]).toBe("巴西");
    expect(COUNTRY_NAME_ZH["RUS"]).toBe("俄罗斯");
    expect(COUNTRY_NAME_ZH["USA"]).toBe("美国");
  });
});

describe("ZH_TO_EN 反向映射", () => {
  it("中文名可反向查找", () => {
    expect(ZH_TO_EN["中国"]).toBe("China");
    expect(ZH_TO_EN["美国"]).toBe("United States");
    expect(ZH_TO_EN["巴西"]).toBe("Brazil");
  });
});
