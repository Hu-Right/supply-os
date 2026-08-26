/**
 * server/services/notice-search/agencies/cache.ts 测试
 * 覆盖机构缓存管理：getNoticeAgencies + getAgencyCacheData + setAgencyCacheData + clearAgenciesCache
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getNoticeAgencies, getAgencyCacheData, setAgencyCacheData, clearAgenciesCache,
} from "../../../../server/services/notice-search/agencies/cache";

describe("getNoticeAgencies", () => {
  beforeEach(() => {
    clearAgenciesCache();
  });

  it("缓存过期 + 无 refreshFn → 抛出异常", async () => {
    const pool = { query: vi.fn() };
    await expect(getNoticeAgencies(pool as any)).rejects.toThrow("refreshFn required");
  });

  it("缓存有效 → 直接返回缓存数据", async () => {
    const items = [
      { agency: "UNDP", count: 100, i18n: { zh: "联合国开发计划署" } },
    ];
    setAgencyCacheData(items as any);
    const pool = { query: vi.fn() };
    const result = await getNoticeAgencies(pool as any);
    // 从缓存返回，不查询 DB
    expect(pool.query).not.toHaveBeenCalled();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].agency).toBe("UNDP");
  });

  it("locale=zh → 返回翻译名", async () => {
    const items = [
      { agency: "UNDP", count: 100, i18n: { zh: "联合国开发计划署" } },
    ];
    setAgencyCacheData(items as any);
    const pool = { query: vi.fn() };
    const result = await getNoticeAgencies(pool as any, "zh");
    expect(result[0].agency_i18n).toBe("联合国开发计划署");
  });

  it("locale=en → 不返回翻译名", async () => {
    const items = [
      { agency: "UNDP", count: 100, i18n: { zh: "联合国开发计划署" } },
    ];
    setAgencyCacheData(items as any);
    const pool = { query: vi.fn() };
    const result = await getNoticeAgencies(pool as any, "en");
    expect(result[0].agency_i18n).toBeUndefined();
  });

  it("翻译名与机构名相同 → 不返回翻译", async () => {
    const items = [
      { agency: "UNDP", count: 100, i18n: { zh: "UNDP" } },
    ];
    setAgencyCacheData(items as any);
    const pool = { query: vi.fn() };
    const result = await getNoticeAgencies(pool as any, "zh");
    expect(result[0].agency_i18n).toBeUndefined();
  });
});

describe("getAgencyCacheData / setAgencyCacheData", () => {
  beforeEach(() => {
    clearAgenciesCache();
  });

  it("初始为 null", () => {
    expect(getAgencyCacheData()).toBeNull();
  });

  it("设置后可读取", () => {
    const items = [{ agency: "TEST", count: 1 }];
    setAgencyCacheData(items as any);
    expect(getAgencyCacheData()).toEqual(items);
  });
});

describe("clearAgenciesCache", () => {
  it("清除后 getAgencyCacheData 返回 null", () => {
    setAgencyCacheData([{ agency: "X", count: 1 }] as any);
    clearAgenciesCache();
    expect(getAgencyCacheData()).toBeNull();
  });
});
