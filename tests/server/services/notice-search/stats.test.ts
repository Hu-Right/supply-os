/**
 * server/services/notice-search/stats.ts 测试
 * 覆盖 statsKeyFor（纯逻辑）+ getStatsCount / clearStatsCache（DB mock）
 */
import { describe, it, expect, vi } from "vitest";
import { statsKeyFor, getStatsCount, clearStatsCache } from "../../../../server/services/notice-search/stats";

describe("statsKeyFor", () => {
  const baseParams = {
    page: 1, pageSize: 9, q: "", country: "", agency: "",
    deadlineFrom: "", deadlineTo: "", sort: "deadline_farthest" as const,
    deadlineWithinDays: 0, noticeType: "", featuredOnly: false,
    codeId: 0,
  };

  it("有搜索词 → null（走 COUNT 查询）", () => {
    expect(statsKeyFor({ ...baseParams, q: "test" })).toBeNull();
  });

  it("有 codeId → null", () => {
    expect(statsKeyFor({ ...baseParams, codeId: 42 })).toBeNull();
  });

  it("有截止日期范围 → null", () => {
    expect(statsKeyFor({ ...baseParams, deadlineFrom: "2026-01-01" })).toBeNull();
    expect(statsKeyFor({ ...baseParams, deadlineTo: "2026-12-31" })).toBeNull();
    expect(statsKeyFor({ ...baseParams, deadlineWithinDays: 30 })).toBeNull();
  });

  it("有采购类型 → null", () => {
    expect(statsKeyFor({ ...baseParams, noticeType: "goods" })).toBeNull();
  });

  it("同时有国家和机构 → null", () => {
    expect(statsKeyFor({ ...baseParams, country: "US", agency: "UNDP" })).toBeNull();
  });

  it("仅国家 → country:{country}_v2", () => {
    expect(statsKeyFor({ ...baseParams, country: "US" })).toBe("country:US_v2");
  });

  it("仅机构 → agency:{agency}_v2", () => {
    expect(statsKeyFor({ ...baseParams, agency: "UNDP" })).toBe("agency:UNDP_v2");
  });

  it("聚合机构名 _BR → null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "MUNICIPIO_BR" })).toBeNull();
  });

  it("聚合机构名 FORCE_COUNTRY_ → null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "FORCE_COUNTRY_US" })).toBeNull();
  });

  it("聚合机构名 ORPHAN_ → null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "ORPHAN_OTHER" })).toBeNull();
  });

  it("聚合机构名 _INTL → null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "SOMETHING_INTL" })).toBeNull();
  });

  it("聚合机构名 DEV_BANKS → null", () => {
    expect(statsKeyFor({ ...baseParams, agency: "DEV_BANKS" })).toBeNull();
  });

  it("仅精选 → featured_v2", () => {
    expect(statsKeyFor({ ...baseParams, featuredOnly: true })).toBe("featured_v2");
  });

  it("精选 + 国家 → null", () => {
    expect(statsKeyFor({ ...baseParams, featuredOnly: true, country: "US" })).toBeNull();
  });

  it("无筛选条件 → active_total_v2", () => {
    expect(statsKeyFor(baseParams)).toBe("active_total_v2");
  });

  it("不同排序 → 同一 key（排序不影响总数）", () => {
    expect(statsKeyFor({ ...baseParams, sort: "latest" })).toBe("active_total_v2");
    expect(statsKeyFor({ ...baseParams, sort: "deadline" })).toBe("active_total_v2");
  });
});

describe("getStatsCount", () => {
  it("命中 → 返回数值", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[{ stat_value: 12345 }]]) };
    const result = await getStatsCount(pool as any, "active_total_v2");
    expect(result).toBe(12345);
  });

  it("未命中 → 返回 null", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[]]) };
    const result = await getStatsCount(pool as any, "nonexistent");
    expect(result).toBeNull();
  });

  it("DB 异常 → 返回 null", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("DB error")) };
    const result = await getStatsCount(pool as any, "active_total_v2");
    expect(result).toBeNull();
  });
});

describe("clearStatsCache", () => {
  it("调用不抛异常", () => {
    expect(() => clearStatsCache()).not.toThrow();
  });
});
