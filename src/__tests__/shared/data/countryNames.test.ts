import { describe, it, expect } from "vitest";
import { getCountryDisplayName, getCountryEnglishName } from "@/shared/data/countryNames";

describe("getCountryDisplayName", () => {
  describe("non-zh locale", () => {
    it("returns English name for en locale", () => {
      expect(getCountryDisplayName("Brazil", "en")).toBe("Brazil");
    });

    it("returns English name for fr locale", () => {
      expect(getCountryDisplayName("China", "fr")).toBe("China");
    });

    it("returns English name unchanged for unknown locale", () => {
      expect(getCountryDisplayName("Japan", "de")).toBe("Japan");
    });
  });

  describe("zh locale - exact match", () => {
    it("maps Brazil to 巴西", () => {
      expect(getCountryDisplayName("Brazil", "zh")).toBe("巴西");
    });

    it("maps China to 中国", () => {
      expect(getCountryDisplayName("China", "zh")).toBe("中国");
    });

    it("maps United States to 美国", () => {
      expect(getCountryDisplayName("United States", "zh")).toBe("美国");
    });

    it("maps Japan to 日本", () => {
      expect(getCountryDisplayName("Japan", "zh")).toBe("日本");
    });

    it("maps Germany to 德国", () => {
      expect(getCountryDisplayName("Germany", "zh")).toBe("德国");
    });

    it("maps United Kingdom to 英国", () => {
      expect(getCountryDisplayName("United Kingdom", "zh")).toBe("英国");
    });
  });

  describe("zh locale - variants and aliases", () => {
    it("maps USA to 美国", () => {
      expect(getCountryDisplayName("USA", "zh")).toBe("美国");
    });

    it("maps UK to 英国", () => {
      expect(getCountryDisplayName("UK", "zh")).toBe("英国");
    });

    it("maps PRC to 中国", () => {
      expect(getCountryDisplayName("PRC", "zh")).toBe("中国");
    });

    it("maps South Korea to 韩国", () => {
      expect(getCountryDisplayName("South Korea", "zh")).toBe("韩国");
    });

    it("maps North Korea to 朝鲜", () => {
      expect(getCountryDisplayName("North Korea", "zh")).toBe("朝鲜");
    });

    it("maps Russia to 俄罗斯", () => {
      expect(getCountryDisplayName("Russia", "zh")).toBe("俄罗斯");
    });

    it("maps UAE to 阿联酋", () => {
      expect(getCountryDisplayName("UAE", "zh")).toBe("阿联酋");
    });
  });

  describe("zh locale - case insensitive", () => {
    it("maps lowercase america to 美国", () => {
      expect(getCountryDisplayName("america", "zh")).toBe("美国");
    });
  });

  describe("zh locale - region resolution", () => {
    it("resolves Canada, British Columbia", () => {
      const result = getCountryDisplayName("Canada, British Columbia", "zh");
      expect(result).toContain("加拿大");
      expect(result).toContain("不列颠哥伦比亚");
    });

    it("resolves Australia, New South Wales", () => {
      const result = getCountryDisplayName("Australia, New South Wales", "zh");
      expect(result).toContain("澳大利亚");
      expect(result).toContain("新南威尔士");
    });
  });

  describe("zh locale - fallback", () => {
    it("returns original name for unknown country", () => {
      expect(getCountryDisplayName("Unknown Country", "zh")).toBe("Unknown Country");
    });
  });

  describe("zh locale - Chinese names already in Chinese", () => {
    it("maps 英国 to 英国 (identity)", () => {
      expect(getCountryDisplayName("英国", "zh")).toBe("英国");
    });

    it("maps 美国 to 美国 (identity)", () => {
      expect(getCountryDisplayName("美国", "zh")).toBe("美国");
    });
  });
});

describe("getCountryEnglishName", () => {
  it("returns English name for English input", () => {
    expect(getCountryEnglishName("Brazil")).toBe("Brazil");
  });

  it("returns English name for Chinese input", () => {
    expect(getCountryEnglishName("巴西")).toBe("Brazil");
  });

  it("returns 中国 for China mapping", () => {
    expect(getCountryEnglishName("中国")).toBe("China");
  });

  it("returns 美国 for USA mapping", () => {
    expect(getCountryEnglishName("美国")).toBe("United States");
  });

  it("returns original for unknown Chinese name", () => {
    expect(getCountryEnglishName("未知国家")).toBe("未知国家");
  });

  it("returns original for English name not in mapping", () => {
    expect(getCountryEnglishName("SomeUnknownPlace")).toBe("SomeUnknownPlace");
  });
});
