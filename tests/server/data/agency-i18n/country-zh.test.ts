/**
 * server/data/agency-i18n/country-zh.ts 测试
 * 验证国家名称中文映射和国际机构类型标签
 */
import { describe, it, expect } from "vitest";
import { COUNTRY_ZH, INTL_TYPE_EN } from "../../../../server/data/agency-i18n/country-zh";

describe("COUNTRY_ZH", () => {
  it("导出为非空对象", () => {
    expect(typeof COUNTRY_ZH).toBe("object");
    expect(Object.keys(COUNTRY_ZH).length).toBeGreaterThan(0);
  });

  it("所有值为非空字符串", () => {
    for (const [key, value] of Object.entries(COUNTRY_ZH)) {
      expect(typeof key).toBe("string");
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it("包含增量条目 Ivory Coast → 科特迪瓦", () => {
    expect(COUNTRY_ZH["Ivory Coast"]).toBe("科特迪瓦");
  });

  it("包含增量条目 Swaziland → 斯威士兰", () => {
    expect(COUNTRY_ZH["Swaziland"]).toBe("斯威士兰");
  });

  it("包含增量条目 Burma → 缅甸", () => {
    expect(COUNTRY_ZH["Burma"]).toBe("缅甸");
  });
});

describe("INTL_TYPE_EN", () => {
  it("导出为非空对象", () => {
    expect(typeof INTL_TYPE_EN).toBe("object");
    expect(Object.keys(INTL_TYPE_EN).length).toBeGreaterThan(0);
  });

  it("所有键以 _INTL 结尾", () => {
    for (const key of Object.keys(INTL_TYPE_EN)) {
      expect(key).toMatch(/_INTL$/);
    }
  });

  it("所有值为非空字符串", () => {
    for (const value of Object.values(INTL_TYPE_EN)) {
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it("包含常见机构类型", () => {
    expect(INTL_TYPE_EN["MINISTRY_INTL"]).toBe("Ministries");
    expect(INTL_TYPE_EN["UNIVERSITY_INTL"]).toBe("Universities");
    expect(INTL_TYPE_EN["HOSPITAL_INTL"]).toBe("Hospitals");
    expect(INTL_TYPE_EN["BANK_INTL"]).toBe("Banks");
    expect(INTL_TYPE_EN["NGO_INTL"]).toBe("NGOs");
  });
});
