/**
 * server/services/notice-search/cache.ts 测试
 * 覆盖 searchCacheKey, countCacheKey, getCountCache, setCountCache, clearCountCaches, clearAllCaches
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  searchCacheKey,
  countCacheKey,
  getCountCache,
  setCountCache,
  clearCountCaches,
  clearAllCaches,
  noticeSearchCache,
  setNoticeTypeCache,
  _noticeTypeCache,
} from "../../../../server/services/notice-search/cache";

const baseParams = {
  page: 1,
  pageSize: 20,
  codeId: 0,
  q: "",
  country: "",
  agency: "",
  deadlineFrom: "",
  deadlineTo: "",
  sort: "deadline_farthest",
  deadlineWithinDays: 0,
  noticeType: "",
  featuredOnly: false,
  locale: "",
};

describe("searchCacheKey", () => {
  it("相同参数 → 相同 key", () => {
    const k1 = searchCacheKey(baseParams as any);
    const k2 = searchCacheKey(baseParams as any);
    expect(k1).toBe(k2);
  });

  it("不同 page → 不同 key", () => {
    const k1 = searchCacheKey(baseParams as any);
    const k2 = searchCacheKey({ ...baseParams, page: 2 } as any);
    expect(k1).not.toBe(k2);
  });

  it("不同 q → 不同 key", () => {
    const k1 = searchCacheKey({ ...baseParams, q: "water" } as any);
    const k2 = searchCacheKey({ ...baseParams, q: "energy" } as any);
    expect(k1).not.toBe(k2);
  });

  it("不同 country → 不同 key", () => {
    const k1 = searchCacheKey({ ...baseParams, country: "Kenya" } as any);
    const k2 = searchCacheKey({ ...baseParams, country: "China" } as any);
    expect(k1).not.toBe(k2);
  });

  it("featuredOnly → 影响 key", () => {
    const k1 = searchCacheKey({ ...baseParams, featuredOnly: true } as any);
    const k2 = searchCacheKey({ ...baseParams, featuredOnly: false } as any);
    expect(k1).not.toBe(k2);
  });
});

describe("countCacheKey", () => {
  it("不含 page/pageSize/sort（不影响总数）", () => {
    const k1 = countCacheKey(baseParams as any);
    const k2 = countCacheKey({ ...baseParams, page: 5, pageSize: 50, sort: "latest" } as any);
    expect(k1).toBe(k2);
  });

  it("包含 'count' 前缀", () => {
    const k = countCacheKey(baseParams as any);
    expect(k).toContain("count");
  });

  it("不同 country → 不同 key", () => {
    const k1 = countCacheKey({ ...baseParams, country: "Kenya" } as any);
    const k2 = countCacheKey({ ...baseParams, country: "China" } as any);
    expect(k1).not.toBe(k2);
  });
});

describe("getCountCache / setCountCache", () => {
  beforeEach(() => {
    clearCountCaches();
  });

  it("set + get（keyword=true）", () => {
    setCountCache("kw-test", true, 100);
    expect(getCountCache("kw-test", true)).toBe(100);
  });

  it("set + get（keyword=false）", () => {
    setCountCache("reg-test", false, 200);
    expect(getCountCache("reg-test", false)).toBe(200);
  });

  it("keyword 通道隔离", () => {
    setCountCache("key1", true, 10);
    setCountCache("key1", false, 20);
    expect(getCountCache("key1", true)).toBe(10);
    expect(getCountCache("key1", false)).toBe(20);
  });

  it("未命中 → undefined", () => {
    expect(getCountCache("nonexistent", true)).toBeUndefined();
    expect(getCountCache("nonexistent", false)).toBeUndefined();
  });
});

describe("clearCountCaches", () => {
  it("清除后 getCountCache → undefined", () => {
    setCountCache("a", true, 1);
    setCountCache("b", false, 2);
    clearCountCaches();
    expect(getCountCache("a", true)).toBeUndefined();
    expect(getCountCache("b", false)).toBeUndefined();
  });
});

describe("clearAllCaches", () => {
  it("清除所有缓存不抛错", () => {
    noticeSearchCache.set("test", { items: [], total: 0, page: 1, pageSize: 20 });
    setCountCache("x", true, 1);
    setNoticeTypeCache({ types: ["rfq"], expires: Date.now() + 1000 });
    expect(() => clearAllCaches()).not.toThrow();
    expect(noticeSearchCache.get("test")).toBeUndefined();
  });
});
