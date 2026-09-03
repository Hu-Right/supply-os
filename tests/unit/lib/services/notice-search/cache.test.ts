import { describe, it, expect, beforeEach } from "vitest";
import {
  searchCacheKey, countCacheKey, getCountCache, setCountCache,
  clearCountCaches, clearAllCaches, featuredCountCache,
} from "@/lib/services/notice-search/cache";
import type { NoticeSearchParams } from "@/lib/services/notice-search/types";

const defaultParams: NoticeSearchParams = {
  page: 1, pageSize: 9, q: "", country: "", agency: "",
  deadlineFrom: "", deadlineTo: "", sort: "deadline_farthest",
  deadlineWithinDays: 0, noticeType: "", featuredOnly: false, locale: "en",
};

describe("searchCacheKey", () => {
  it("相同参数 → 相同 key", () => {
    expect(searchCacheKey(defaultParams)).toBe(searchCacheKey(defaultParams));
  });

  it("不同参数 → 不同 key", () => {
    const p2 = { ...defaultParams, q: "construction" };
    expect(searchCacheKey(defaultParams)).not.toBe(searchCacheKey(p2));
  });
});

describe("countCacheKey", () => {
  it("不含 page/pageSize（翻页不影响总数）", () => {
    const p1 = { ...defaultParams, page: 1 };
    const p2 = { ...defaultParams, page: 2 };
    expect(countCacheKey(p1)).toBe(countCacheKey(p2));
  });

  it("不同 country → 不同 key", () => {
    const p1 = { ...defaultParams, country: "China" };
    const p2 = { ...defaultParams, country: "Brazil" };
    expect(countCacheKey(p1)).not.toBe(countCacheKey(p2));
  });
});

describe("getCountCache / setCountCache", () => {
  beforeEach(() => clearCountCaches());

  it("写入后读取 → 命中", () => {
    setCountCache("test-key", false, 100);
    expect(getCountCache("test-key", false)).toBe(100);
  });

  it("keyword 与非 keyword 隔离", () => {
    setCountCache("key", false, 100);
    setCountCache("key", true, 200);
    expect(getCountCache("key", false)).toBe(100);
    expect(getCountCache("key", true)).toBe(200);
  });

  it("clearCountCaches → 清空", () => {
    setCountCache("key", false, 100);
    clearCountCaches();
    expect(getCountCache("key", false)).toBeUndefined();
  });
});

describe("clearAllCaches", () => {
  it("清空所有缓存", () => {
    setCountCache("key", false, 100);
    featuredCountCache.total = 50;
    clearAllCaches();
    expect(getCountCache("key", false)).toBeUndefined();
    expect(featuredCountCache.total).toBe(0);
  });
});
