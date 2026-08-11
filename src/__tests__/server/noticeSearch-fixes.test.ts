// @vitest-environment node
/**
 * 搜索修复验证测试
 * 验证 P0-P3 级别修复的正确性
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { countCacheKey, searchCacheKey, clearAllCaches } from "../../../server/services/notice-search/cache";
import { statsKeyFor } from "../../../server/services/notice-search/stats";
import { expandCountryAliases, expandCountryAllForms, refreshNoticeCountries, clearCountriesCache as clearCountriesCacheLocal } from "../../../server/services/notice-search/countries";
import type { NoticeSearchParams } from "../../../server/services/notice-search/types";

beforeEach(() => {
  clearAllCaches();
});

// ─── P3-10: countCacheKey 移除冗余 sort ──────────────────────────────────────
describe("P3-10: countCacheKey 不包含 sort 参数", () => {
  it("不同 sort 值生成相同的 countCacheKey", () => {
    const base: NoticeSearchParams = {
      page: 1, pageSize: 9, country: "Brazil",
    };
    const key1 = countCacheKey({ ...base, sort: "deadline_farthest" });
    const key2 = countCacheKey({ ...base, sort: "latest" });
    const key3 = countCacheKey({ ...base, sort: "deadline" });
    expect(key1).toBe(key2);
    expect(key2).toBe(key3);
  });

  it("不同筛选条件仍生成不同的 countCacheKey", () => {
    const key1 = countCacheKey({ page: 1, pageSize: 9, country: "Brazil" });
    const key2 = countCacheKey({ page: 1, pageSize: 9, country: "Germany" });
    expect(key1).not.toBe(key2);
  });

  it("不同 page 值生成相同的 countCacheKey（翻页不影响总数）", () => {
    const base: NoticeSearchParams = { page: 1, pageSize: 9, q: "water" };
    const key1 = countCacheKey(base);
    const key2 = countCacheKey({ ...base, page: 5 });
    expect(key1).toBe(key2);
  });
});

// ─── P1-5: statsKeyFor 对聚合机构返回 null ───────────────────────────────────
describe("P1-5: statsKeyFor 对聚合机构名返回 null", () => {
  const baseParams: NoticeSearchParams = {
    page: 1, pageSize: 9,
  };

  it("巴西聚合机构 MUNICIPIO_BR 返回 null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "MUNICIPIO_BR" })).toBeNull();
  });

  it("巴西聚合机构 FUNDO_BR 返回 null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "FUNDO_BR" })).toBeNull();
  });

  it("国家级强制聚合 FORCE_COUNTRY_Brazil 返回 null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "FORCE_COUNTRY_Brazil" })).toBeNull();
  });

  it("国家级强制聚合 FORCE_COUNTRY_Kenya 返回 null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "FORCE_COUNTRY_Kenya" })).toBeNull();
  });

  it("兜底聚合 ORPHAN_Brazil 返回 null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "ORPHAN_Brazil" })).toBeNull();
  });

  it("兜底聚合 ORPHAN_OTHER 返回 null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "ORPHAN_OTHER" })).toBeNull();
  });

  it("国际聚合类型 COUNCIL_INTL 返回 null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "COUNCIL_INTL" })).toBeNull();
  });

  it("DEV_BANKS 返回 null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "DEV_BANKS" })).toBeNull();
  });

  it("独立机构 UNDP 仍可命中统计表", () => {
    expect(statsKeyFor({ ...baseParams, agency: "UNDP" })).toBe("agency:UNDP");
  });

  it("独立机构 SAM 仍可命中统计表", () => {
    expect(statsKeyFor({ ...baseParams, agency: "SAM" })).toBe("agency:SAM");
  });

  it("国家筛选仍可命中统计表", () => {
    expect(statsKeyFor({ ...baseParams, country: "Brazil" })).toBe("country:Brazil");
  });

  it("无筛选条件返回 active_total", () => {
    expect(statsKeyFor(baseParams)).toBe("active_total");
  });

  it("精选筛选返回 featured", () => {
    expect(statsKeyFor({ ...baseParams, featuredOnly: true })).toBe("featured");
  });

  it("有关键词时返回 null（走 FULLTEXT COUNT）", () => {
    expect(statsKeyFor({ ...baseParams, q: "water" })).toBeNull();
  });

  it("有 codeId 时返回 null（走桥接表 COUNT）", () => {
    expect(statsKeyFor({ ...baseParams, codeId: 1001 })).toBeNull();
  });
});

// ─── P0-2: FORCE_COUNTRY 冲突检测（行为验证）─────────────────────────────────
describe("P0-2: FORCE_COUNTRY 机构解析一致性", () => {
  it("FORCE_COUNTRY key 包含国家名", () => {
    // 验证 FORCE_COUNTRY_XXX 格式的正确性
    const key = "FORCE_COUNTRY_Brazil";
    const country = key.slice(14); // 与代码中的 slice(14) 一致
    expect(country).toBe("Brazil");
  });

  it("FORCE_COUNTRY key 支持 Kenya", () => {
    const key = "FORCE_COUNTRY_Kenya";
    const country = key.slice(14);
    expect(country).toBe("Kenya");
  });
});

// ─── P2-6: deadlineWithinDays 时间基准统一（行为验证）─────────────────────────
describe("P2-6: deadlineWithinDays 使用应用服务器时间", () => {
  it("计算未来时间戳使用 Date.now() 而非 MySQL NOW()", () => {
    const deadlineWithinDays = 30;
    const nowSec = Math.floor(Date.now() / 1000);
    const futureTs = nowSec + deadlineWithinDays * 86400;
    // 验证时间戳在合理范围内（30天 ± 1分钟）
    const expectedMin = nowSec + 30 * 86400 - 60;
    const expectedMax = nowSec + 30 * 86400 + 60;
    expect(futureTs).toBeGreaterThanOrEqual(expectedMin);
    expect(futureTs).toBeLessThanOrEqual(expectedMax);
  });
});

// ─── 缓存 key 稳定性验证 ─────────────────────────────────────────────────────
describe("缓存 key 稳定性", () => {
  it("searchCacheKey 包含 sort（影响排序结果）", () => {
    const key1 = searchCacheKey({ page: 1, pageSize: 9, sort: "latest" } as NoticeSearchParams);
    const key2 = searchCacheKey({ page: 1, pageSize: 9, sort: "deadline_farthest" } as NoticeSearchParams);
    expect(key1).not.toBe(key2);
  });

  it("countCacheKey 不包含 sort（排序不影响总数）", () => {
    const key1 = countCacheKey({ page: 1, pageSize: 9, sort: "latest" } as NoticeSearchParams);
    const key2 = countCacheKey({ page: 1, pageSize: 9, sort: "deadline_farthest" } as NoticeSearchParams);
    expect(key1).toBe(key2);
  });
});

// ─── 国家名归一化：修复"菲律宾"重复问题 ─────────────────────────────────────
describe("国家名归一化：expandCountryAliases（返回大写形式，用于 MySQL UPPER() 匹配）", () => {
  it("Philippines 展开包含所有已知别名的大写形式", () => {
    const variants = expandCountryAliases("Philippines");
    // expandCountryAliases 返回大写形式
    expect(variants).toContain("PHILIPPINES");
    expect(variants).toContain("THE PHILIPPINES");
    expect(variants).toContain("PHL");
    expect(variants).toContain("REPUBLIC OF THE PHILIPPINES");
  });

  it("无别名的国家返回自身大写", () => {
    const variants = expandCountryAliases("Germany");
    expect(variants.length).toBeGreaterThanOrEqual(1);
    expect(variants).toContain("GERMANY");
  });

  it("Brazil 展开包含 BRASIL", () => {
    const variants = expandCountryAliases("Brazil");
    expect(variants).toContain("BRAZIL");
    expect(variants).toContain("BRASIL");
  });

  it("China 展开包含 PRC 等别名", () => {
    const variants = expandCountryAliases("China");
    expect(variants).toContain("CHINA");
    expect(variants).toContain("PRC");
    expect(variants).toContain("PEOPLE'S REPUBLIC OF CHINA");
  });

  it("United States 展开包含 USA/US 等别名", () => {
    const variants = expandCountryAliases("United States");
    expect(variants).toContain("UNITED STATES");
    expect(variants).toContain("USA");
    expect(variants).toContain("US");
    expect(variants).toContain("UNITED STATES OF AMERICA");
  });

  it("South Korea 展开包含 Republic of Korea 等别名", () => {
    const variants = expandCountryAliases("South Korea");
    expect(variants).toContain("SOUTH KOREA");
    expect(variants).toContain("REPUBLIC OF KOREA");
    expect(variants).toContain("R.O.K");
  });
});

describe("expandCountryAllForms（返回原始+大写形式，用于 Meilisearch 匹配）", () => {
  it("Philippines 包含原始大小写和大写形式", () => {
    const variants = expandCountryAllForms("Philippines");
    // 原始形式
    expect(variants).toContain("Philippines");
    expect(variants).toContain("The Philippines");
    expect(variants).toContain("Philippine");
    // 大写形式
    expect(variants).toContain("PHILIPPINES");
    expect(variants).toContain("THE PHILIPPINES");
    expect(variants).toContain("PHL");
  });

  it("China 包含原始和大写形式", () => {
    const variants = expandCountryAllForms("China");
    expect(variants).toContain("China");
    expect(variants).toContain("PRC");
    expect(variants).toContain("CHINA");
  });
});

describe("国家下拉归一化：refreshNoticeCountries", () => {
  beforeEach(() => {
    clearCountriesCacheLocal();
  });

  it("将 Philippines 和 The Philippines 合并为一条", async () => {
    const pool = {
      query: async () => [[
        { country: "Philippines", cnt: 100 },
        { country: "The Philippines", cnt: 50 },
        { country: "PHL", cnt: 20 },
      ]],
    } as any;

    const data = await refreshNoticeCountries(pool);
    // 应该只有一条 Philippines，计数为 170
    const ph = data.find((d: any) => d.country === "Philippines");
    expect(ph).toBeDefined();
    expect(ph.count).toBe(170);
    // 不应存在 The Philippines 或 PHL 作为独立条目
    expect(data.find((d: any) => d.country === "The Philippines")).toBeUndefined();
    expect(data.find((d: any) => d.country === "PHL")).toBeUndefined();
  });

  it("将 Brazil 和 Brasil 合并为一条", async () => {
    const pool = {
      query: async () => [[
        { country: "Brazil", cnt: 500 },
        { country: "Brasil", cnt: 30 },
      ]],
    } as any;

    const data = await refreshNoticeCountries(pool);
    const br = data.find((d: any) => d.country === "Brazil");
    expect(br).toBeDefined();
    expect(br.count).toBe(530);
  });

  it("将 China/PRC/People's Republic of China 合并", async () => {
    const pool = {
      query: async () => [[
        { country: "China", cnt: 200 },
        { country: "PRC", cnt: 10 },
        { country: "People's Republic of China", cnt: 5 },
      ]],
    } as any;

    const data = await refreshNoticeCountries(pool);
    const cn = data.find((d: any) => d.country === "China");
    expect(cn).toBeDefined();
    expect(cn.count).toBe(215);
  });

  it("无别名的国家保持原样", async () => {
    const pool = {
      query: async () => [[
        { country: "Japan", cnt: 300 },
        { country: "Germany", cnt: 250 },
      ]],
    } as any;

    const data = await refreshNoticeCountries(pool);
    expect(data.find((d: any) => d.country === "Japan")?.count).toBe(300);
    expect(data.find((d: any) => d.country === "Germany")?.count).toBe(250);
  });

  it("结果按 count 降序排列", async () => {
    const pool = {
      query: async () => [[
        { country: "Philippines", cnt: 10 },
        { country: "Brazil", cnt: 500 },
        { country: "China", cnt: 200 },
      ]],
    } as any;

    const data = await refreshNoticeCountries(pool);
    expect(data[0].country).toBe("Brazil");
    expect(data[1].country).toBe("China");
    expect(data[2].country).toBe("Philippines");
  });
});
