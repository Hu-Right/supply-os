/**
 * server/services/notice-search/ 子模块测试
 * 覆盖 agencies/translate.ts, agencies/cache.ts, stats.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── agencies/translate.ts ──
import {
  needsTranslationFix,
  buildZhFromKeywords,
  extractCountryFromName,
} from "../../../../server/services/notice-search/agencies/translate";

describe("needsTranslationFix", () => {
  it("undefined/空串 → 需要修复", () => {
    expect(needsTranslationFix(undefined, "UNICEF")).toBe(true);
    expect(needsTranslationFix("", "UNICEF")).toBe(true);
  });

  it("翻译名与原名相同 → 需要修复", () => {
    expect(needsTranslationFix("UNICEF", "UNICEF")).toBe(true);
  });

  it("英文字母多于中文字 → 需要修复", () => {
    expect(needsTranslationFix("United Nations Children Fund", "UNICEF")).toBe(true);
  });

  it("含 4+ 连续英文字母 → 需要修复", () => {
    expect(needsTranslationFix("Ministère de la Santé", "MOH")).toBe(true);
  });

  it("纯中文翻译 → 不需要修复", () => {
    expect(needsTranslationFix("联合国儿童基金会", "UNICEF")).toBe(false);
  });

  it("中文为主 + 少量英文 → 不需要修复", () => {
    expect(needsTranslationFix("中国商务部", "MOFCOM")).toBe(false);
  });
});

describe("buildZhFromKeywords", () => {
  it("匹配 Committee → 委员会", () => {
    expect(buildZhFromKeywords("National Planning Committee")).toBe("委员会");
  });

  it("匹配 Ministry → 部", () => {
    expect(buildZhFromKeywords("Ministry of Finance")).toBe("部");
  });

  it("匹配 University → 大学", () => {
    expect(buildZhFromKeywords("University of Nairobi")).toBe("大学");
  });

  it("匹配 Bank → 银行", () => {
    expect(buildZhFromKeywords("World Bank")).toBe("银行");
  });

  it("匹配 Hospital → 医院", () => {
    expect(buildZhFromKeywords("City General Hospital")).toBe("医院");
  });

  it("无匹配 → null", () => {
    expect(buildZhFromKeywords("Alpha Beta Gamma")).toBeNull();
  });
});

describe("extractCountryFromName", () => {
  it("提取 CHINA → 中国", () => {
    expect(extractCountryFromName("Ministry of Commerce China")).toBe("中国");
  });

  it("提取 KENYA → 肯尼亚", () => {
    expect(extractCountryFromName("Kenya National Highways Authority")).toBe("肯尼亚");
  });

  it("提取 DEUTSCH → 德国（别名）", () => {
    expect(extractCountryFromName("Deutsch Bundesagentur")).toBe("德国");
  });

  it("多词国家名 SOUTH AFRICA → 南非", () => {
    expect(extractCountryFromName("South Africa Reserve Bank")).toBe("南非");
  });

  it("ISO 代码匹配 .CN. → 中国", () => {
    expect(extractCountryFromName("GOV.CN.AGENCY")).toBe("中国");
  });

  it("GOV 前缀匹配 GOV.US → 美国", () => {
    expect(extractCountryFromName("GOV.US.DEPT")).toBe("美国");
  });

  it("无匹配 → null", () => {
    expect(extractCountryFromName("Global Organization")).toBeNull();
  });
});

// ── agencies/cache.ts ──
import {
  getAgencyCacheData,
  setAgencyCacheData,
  clearAgenciesCache,
} from "../../../../server/services/notice-search/agencies/cache";

describe("agencies/cache", () => {
  beforeEach(() => {
    clearAgenciesCache();
  });

  it("初始缓存为 null", () => {
    expect(getAgencyCacheData()).toBeNull();
  });

  it("set + get 缓存数据", () => {
    const data = [{ agency: "UNICEF", count: 30, i18n: { zh: "联合国儿童基金会" } } as any];
    setAgencyCacheData(data);
    const result = getAgencyCacheData();
    expect(result).toHaveLength(1);
    expect(result![0].agency).toBe("UNICEF");
  });

  it("clearAgenciesCache 清空缓存", () => {
    setAgencyCacheData([{ agency: "UNDP" } as any]);
    clearAgenciesCache();
    expect(getAgencyCacheData()).toBeNull();
  });
});

// ── stats.ts — statsKeyFor ──
import { statsKeyFor, clearStatsCache } from "../../../../server/services/notice-search/stats";

describe("statsKeyFor", () => {
  beforeEach(() => {
    clearStatsCache();
  });

  it("有 q → null（全文搜索不走统计表）", () => {
    expect(statsKeyFor({ q: "water" } as any)).toBeNull();
  });

  it("有 codeId → null", () => {
    expect(statsKeyFor({ codeId: 5 } as any)).toBeNull();
  });

  it("有 deadline 参数 → null", () => {
    expect(statsKeyFor({ deadlineFrom: "2026-01-01" } as any)).toBeNull();
    expect(statsKeyFor({ deadlineTo: "2026-12-31" } as any)).toBeNull();
    expect(statsKeyFor({ deadlineWithinDays: 30 } as any)).toBeNull();
  });

  it("有 noticeType → null", () => {
    expect(statsKeyFor({ noticeType: "rfq" } as any)).toBeNull();
  });

  it("同时有 country + agency → null", () => {
    expect(statsKeyFor({ country: "Kenya", agency: "UNDP" } as any)).toBeNull();
  });

  it("聚合机构名 → null", () => {
    expect(statsKeyFor({ agency: "MUNICIPIO_BR" } as any)).toBeNull();
    expect(statsKeyFor({ agency: "FORCE_COUNTRY_X" } as any)).toBeNull();
    expect(statsKeyFor({ agency: "ORPHAN_A" } as any)).toBeNull();
    expect(statsKeyFor({ agency: "DEV_BANKS" } as any)).toBeNull();
    expect(statsKeyFor({ agency: "UNDP_INTL" } as any)).toBeNull();
  });

  it("普通 agency → agency:xxx_v2", () => {
    expect(statsKeyFor({ agency: "UNDP" } as any)).toBe("agency:UNDP_v2");
  });

  it("country → country:xxx_v2", () => {
    expect(statsKeyFor({ country: "Kenya" } as any)).toBe("country:Kenya_v2");
  });

  it("featuredOnly → featured_v2", () => {
    expect(statsKeyFor({ featuredOnly: true } as any)).toBe("featured_v2");
  });

  it("无条件 → active_total_v2", () => {
    expect(statsKeyFor({} as any)).toBe("active_total_v2");
  });
});
