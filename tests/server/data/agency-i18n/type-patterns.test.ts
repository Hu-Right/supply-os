/**
 * server/data/agency-i18n/type-patterns.ts 测试
 * 验证机构类型聚合分类模式的结构和匹配
 */
import { describe, it, expect } from "vitest";
import { TYPE_PATTERNS, INTL_TYPE_PATTERNS } from "../../../../server/data/agency-i18n/type-patterns";

describe("TYPE_PATTERNS", () => {
  it("导出为非空数组", () => {
    expect(Array.isArray(TYPE_PATTERNS)).toBe(true);
    expect(TYPE_PATTERNS.length).toBeGreaterThan(0);
  });

  it("每项都是 [RegExp, { typeKey, i18n }] 元组", () => {
    for (const [pattern, config] of TYPE_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
      expect(typeof config.typeKey).toBe("string");
      expect(config.typeKey.length).toBeGreaterThan(0);
      expect(config.i18n).toBeDefined();
      expect(typeof config.i18n.zh).toBe("string");
    }
  });

  it("MUNICIPIO 匹配巴西市政府", () => {
    const match = TYPE_PATTERNS.find(([re]) => re.test("MUNICIPIO DE SAO PAULO"));
    expect(match).toBeDefined();
    expect(match![1].typeKey).toBe("MUNICIPIO_BR");
  });

  it("TRIBUNAL 匹配巴西法院", () => {
    const match = TYPE_PATTERNS.find(([re]) => re.test("TRIBUNAL DE JUSTICA"));
    expect(match).toBeDefined();
    expect(match![1].typeKey).toBe("TRIBUNAL_BR");
  });

  it("COUNTY 匹配肯尼亚县政府", () => {
    const match = TYPE_PATTERNS.find(([re]) => re.test("NAIROBI COUNTY GOVERNMENT"));
    expect(match).toBeDefined();
    expect(match![1].typeKey).toBe("COUNTY_KE");
  });

  it("UN/UNITED NATIONS 匹配联合国系统", () => {
    const match = TYPE_PATTERNS.find(([re]) => re.test("UN DEVELOPMENT"));
    expect(match).toBeDefined();
    expect(match![1].typeKey).toBe("UN_SYSTEM");
  });
});

describe("INTL_TYPE_PATTERNS", () => {
  it("导出为非空数组", () => {
    expect(Array.isArray(INTL_TYPE_PATTERNS)).toBe(true);
    expect(INTL_TYPE_PATTERNS.length).toBeGreaterThan(0);
  });

  it("每项结构正确", () => {
    for (const [pattern, config] of INTL_TYPE_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
      expect(typeof config.typeKey).toBe("string");
      expect(config.i18n).toBeDefined();
      expect(typeof config.i18n.zh).toBe("string");
    }
  });

  it("City Council 匹配市议会", () => {
    const match = INTL_TYPE_PATTERNS.find(([re]) => re.test("Portland City Council"));
    expect(match).toBeDefined();
    expect(match![1].typeKey).toBe("CITY_COUNCIL_INTL");
  });

  it("Ministry of 匹配部委", () => {
    const match = INTL_TYPE_PATTERNS.find(([re]) => re.test("Ministry of Health"));
    expect(match).toBeDefined();
    expect(match![1].typeKey).toBe("MINISTRY_INTL");
  });

  it("University 匹配大学", () => {
    const match = INTL_TYPE_PATTERNS.find(([re]) => re.test("Oxford University"));
    expect(match).toBeDefined();
    expect(match![1].typeKey).toBe("UNIVERSITY_INTL");
  });

  it("Hospital 匹配医院", () => {
    const match = INTL_TYPE_PATTERNS.find(([re]) => re.test("General Hospital"));
    expect(match).toBeDefined();
    expect(match![1].typeKey).toBe("HOSPITAL_INTL");
  });

  it("Bank 匹配银行", () => {
    const match = INTL_TYPE_PATTERNS.find(([re]) => re.test("National Bank"));
    expect(match).toBeDefined();
    expect(match![1].typeKey).toBe("BANK_INTL");
  });

  it("NGO 匹配非政府组织", () => {
    const match = INTL_TYPE_PATTERNS.find(([re]) => re.test("Local NGO"));
    expect(match).toBeDefined();
    expect(match![1].typeKey).toBe("NGO_INTL");
  });
});
