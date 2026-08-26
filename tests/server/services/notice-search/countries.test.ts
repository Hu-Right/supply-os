/**
 * server/services/notice-search/countries.ts 补充测试
 * 覆盖 expandCountryAliases + expandCountryAllForms + refreshNoticeCountries + getNoticeCountries
 */
import { describe, it, expect, vi } from "vitest";
import {
  expandCountryAliases, expandCountryAllForms,
  refreshNoticeCountries, getNoticeCountries, clearCountriesCache,
} from "../../../../server/services/notice-search/countries";

describe("expandCountryAliases", () => {
  it("标准国家名 → 返回大写形式列表", () => {
    const aliases = expandCountryAliases("Philippines");
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.every(a => typeof a === "string")).toBe(true);
  });

  it("未知国家 → 返回大写形式", () => {
    const aliases = expandCountryAliases("Unknownland");
    expect(aliases).toEqual(["UNKNOWNLAND"]);
  });

  it("韩国别名覆盖", () => {
    const aliases = expandCountryAliases("South Korea");
    expect(aliases.length).toBeGreaterThan(1);
  });
});

describe("expandCountryAllForms", () => {
  it("返回原始大小写 + 大写形式", () => {
    const forms = expandCountryAllForms("Philippines");
    expect(forms.length).toBeGreaterThan(1);
    // 应包含大写形式
    expect(forms.some(f => f === f.toUpperCase())).toBe(true);
  });

  it("未知国家 → 返回原名 + 大写", () => {
    const forms = expandCountryAllForms("Unknownland");
    expect(forms).toContain("Unknownland");
    expect(forms).toContain("UNKNOWNLAND");
  });
});

describe("refreshNoticeCountries", () => {
  it("DB 返回数据 → 归一化合并 + 排序", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[
        { country: "Philippines", cnt: 100 },
        { country: "The Philippines", cnt: 50 },
        { country: "China", cnt: 200 },
      ]]),
    } as any;
    const data = await refreshNoticeCountries(pool);
    expect(data.length).toBeGreaterThan(0);
    // 排序：按 count 降序
    for (let i = 1; i < data.length; i++) {
      expect(data[i - 1].count).toBeGreaterThanOrEqual(data[i].count);
    }
  });

  it("空国家名 → 跳过", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue([[
        { country: "", cnt: 100 },
        { country: "China", cnt: 200 },
      ]]),
    } as any;
    const data = await refreshNoticeCountries(pool);
    expect(data.every(d => d.country !== "")).toBe(true);
  });
});

describe("getNoticeCountries", () => {
  it("缓存存在 → 直接返回", async () => {
    // 先刷新缓存
    const pool = { query: vi.fn().mockResolvedValue([[{ country: "US", cnt: 100 }]]) };
    await refreshNoticeCountries(pool);
    // 再次获取应使用缓存
    const data = await getNoticeCountries(pool);
    expect(data.length).toBeGreaterThan(0);
    // pool.query 只在 refresh 时调用了一次
    expect(pool.query.mock.calls.length).toBe(1);
  });

  it("缓存为空 → 触发刷新", async () => {
    clearCountriesCache();
    const pool = { query: vi.fn().mockResolvedValue([[{ country: "US", cnt: 100 }]]) };
    const data = await getNoticeCountries(pool);
    expect(data.length).toBeGreaterThan(0);
    expect(pool.query).toHaveBeenCalled();
  });
});
