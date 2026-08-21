/**
 * server/utils/countryNormalize.ts 测试
 */
import { describe, it, expect } from "vitest";
import { normalizeCountry } from "../../../server/utils/countryNormalize";

describe("normalizeCountry", () => {
  it("精确匹配英文国家名", () => {
    expect(normalizeCountry("Brazil")).toBe("Brazil");
    expect(normalizeCountry("China")).toBe("China");
    expect(normalizeCountry("United States")).toBe("United States");
  });

  it("大小写不敏感匹配", () => {
    expect(normalizeCountry("BRAZIL")).toBe("Brazil");
    expect(normalizeCountry("rus")).toBe("Russia");
    expect(normalizeCountry("RUS")).toBe("Russia");
  });

  it("变体名归一化", () => {
    expect(normalizeCountry("Brasil")).toBe("Brazil");
    expect(normalizeCountry("Russian Federation")).toBe("Russia");
    expect(normalizeCountry("USA")).toBe("United States");
    expect(normalizeCountry("U.S.")).toBe("United States");
    expect(normalizeCountry("UK")).toBe("United Kingdom");
  });

  it("子国家/地区归并到所属国家", () => {
    expect(normalizeCountry("Colombo")).toBe("Sri Lanka");
    expect(normalizeCountry("Mumbai")).toBe("India");
    expect(normalizeCountry("Nairobi")).toBe("Kenya");
    expect(normalizeCountry("Sao Paulo")).toBe("Brazil");
    expect(normalizeCountry("Bogota")).toBe("Colombia");
  });

  it("斜杠分隔符拆分", () => {
    expect(normalizeCountry("Myanmar/Burma")).toBe("Myanmar");
  });

  it("逗号拆分（国家, 区域）", () => {
    expect(normalizeCountry("Canada, British Columbia")).toBe("Canada");
  });

  it("脏数据前缀清理", () => {
    expect(normalizeCountry("/，Basilan")).toBe("Philippines");
  });

  it("未知国家名原样返回", () => {
    expect(normalizeCountry("Atlantis")).toBe("Atlantis");
    expect(normalizeCountry("XYZ Unknown")).toBe("XYZ Unknown");
  });

  it("空字符串返回空字符串", () => {
    expect(normalizeCountry("")).toBe("");
    expect(normalizeCountry("   ")).toBe("");
  });

  it("中文名在映射表中可识别", () => {
    expect(normalizeCountry("英国")).toBe("United Kingdom");
    expect(normalizeCountry("美国")).toBe("United States");
  });
});
