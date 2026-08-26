/**
 * server/services/search-orchestrator/filter-builder.ts 测试
 * 验证双方言筛选条件构建器
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock 外部依赖
vi.mock("../../../../server/services/notice-search/countries", () => ({
  expandCountryAllForms: (c: string) => {
    const map: Record<string, string[]> = {
      "US": ["US", "UNITED STATES", "USA"],
      "CN": ["CN", "CHINA"],
    };
    return map[c] || [c];
  },
  expandCountryAliases: (c: string) => {
    const map: Record<string, string[]> = {
      "US": ["US", "UNITED STATES", "USA"],
    };
    return map[c] || [c.toUpperCase()];
  },
}));

vi.mock("../../../../server/services/notice-search/agencies/index", () => ({
  getAgencyCacheData: vi.fn(() => null),
}));

vi.mock("../../../../server/utils/notice-type", () => ({
  normalizeNoticeType: (t: string) => t?.toLowerCase().trim() || "",
}));

vi.mock("../../../../server/utils/notice-expired", () => ({
  toBeijingUnixTs: (date: string, time: string) => {
    return Math.floor(new Date(`${date}T${time}Z`).getTime() / 1000);
  },
}));

import { buildFilterPlan } from "../../../../server/services/search-orchestrator/filter-builder";
import { getAgencyCacheData } from "../../../../server/services/notice-search/agencies/index";

function createMockPool(types: string[] = []) {
  return {
    query: vi.fn().mockResolvedValue([types.map(t => ({ notice_type: t }))]),
  } as any;
}

const baseParams = {
  page: 1, pageSize: 20, q: "", country: "", agency: "",
  deadlineFrom: "", deadlineTo: "", deadlineWithinDays: 0,
  noticeType: "", featuredOnly: false, sort: "deadline_farthest" as const,
  codeId: 0, mode: "default" as const, userKey: "", locale: "zh",
};

describe("buildFilterPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAgencyCacheData).mockReturnValue(null);
  });

  it("空参数 → digest 为 none", async () => {
    const pool = createMockPool();
    const result = await buildFilterPlan(pool, baseParams as any);
    expect(result.conflictEmpty).toBe(false);
    expect(result.digest).toBe("none");
    expect(result.meiliFilters).toEqual([]);
    expect(result.mysqlWhere).toEqual([]);
  });

  it("国家筛选 → 双方言输出", async () => {
    const pool = createMockPool();
    const result = await buildFilterPlan(pool, { ...baseParams, country: "US" } as any);
    expect(result.meiliFilters.length).toBeGreaterThan(0);
    expect(result.mysqlWhere.length).toBeGreaterThan(0);
    expect(result.digest).toContain("country:US");
    // US 有 3 个变体 → IN 子句
    expect(result.mysqlWhere[0]).toContain("IN");
    expect(result.mysqlParams).toHaveLength(3);
  });

  it("单一国家变体 → 等号匹配", async () => {
    const pool = createMockPool();
    const result = await buildFilterPlan(pool, { ...baseParams, country: "CN" } as any);
    // CN 有 2 个变体 → IN
    expect(result.mysqlWhere[0]).toContain("IN");
  });

  it("截止日期范围 → deadline_sec 筛选", async () => {
    const pool = createMockPool();
    const result = await buildFilterPlan(pool, {
      ...baseParams, deadlineFrom: "2026-09-01", deadlineTo: "2026-12-31",
    } as any);
    expect(result.meiliFilters.some(f => f.includes("deadline_sec >="))).toBe(true);
    expect(result.meiliFilters.some(f => f.includes("deadline_sec <="))).toBe(true);
    expect(result.mysqlWhere).toHaveLength(2);
    expect(result.digest).toContain("from:");
    expect(result.digest).toContain("to:");
  });

  it("deadlineWithinDays > 0 → 排除无截止日期文档", async () => {
    const pool = createMockPool();
    const result = await buildFilterPlan(pool, {
      ...baseParams, deadlineWithinDays: 30,
    } as any);
    expect(result.meiliFilters.some(f => f.includes("deadline_sec > 0"))).toBe(true);
    expect(result.mysqlWhere.some(w => w.includes("deadline_sec > 0"))).toBe(true);
    expect(result.digest).toContain("within:30d");
  });

  it("采购类型 → notice_type_normalized + MySQL 展开", async () => {
    const pool = createMockPool(["Goods", "Supplies", "Services"]);
    const result = await buildFilterPlan(pool, { ...baseParams, noticeType: "goods" } as any);
    expect(result.meiliFilters.some(f => f.includes("notice_type_normalized"))).toBe(true);
    // normalizeNoticeType("Goods") === "goods" → 匹配
    expect(result.mysqlWhere.some(w => w.includes("notice_type IN"))).toBe(true);
    expect(result.digest).toContain("type:goods");
  });

  it("采购类型无匹配 → 1=0 空结果", async () => {
    const pool = createMockPool(["Services"]);
    const result = await buildFilterPlan(pool, { ...baseParams, noticeType: "nonexistent" } as any);
    expect(result.mysqlWhere).toContain("1 = 0");
  });

  it("featuredOnly → is_featured = 1", async () => {
    const pool = createMockPool();
    const result = await buildFilterPlan(pool, { ...baseParams, featuredOnly: true } as any);
    expect(result.meiliFilters).toContain("is_featured = 1");
    expect(result.mysqlWhere).toContain("n.is_featured = 1");
    expect(result.digest).toContain("featured");
  });

  it("UNSPSC 过滤（default 模式）→ level 列", async () => {
    const pool = createMockPool();
    const unspsc = { level: 4, id: "4214", precise: false };
    const result = await buildFilterPlan(pool, baseParams as any, unspsc);
    expect(result.meiliFilters.some(f => f.includes("level4_id"))).toBe(true);
    expect(result.mysqlWhere.some(w => w.includes("unspsc_level4"))).toBe(true);
    expect(result.digest).toContain("unspsc:L4=4214:ted");
  });

  it("UNSPSC 过滤（precise 模式）→ precise_level 列", async () => {
    const pool = createMockPool();
    const unspsc = { level: 3, id: "421", precise: true };
    const result = await buildFilterPlan(pool, baseParams as any, unspsc);
    expect(result.meiliFilters.some(f => f.includes("precise_level3_id"))).toBe(true);
    expect(result.mysqlWhere.some(w => w.includes("precise_level3"))).toBe(true);
    expect(result.digest).toContain("precise");
  });

  it("机构 FORCE_COUNTRY 冲突 → conflictEmpty=true", async () => {
    vi.mocked(getAgencyCacheData).mockReturnValue([
      { agency: "SOME_AGENCY", agencyGroup: "FORCE_COUNTRY_US" },
    ] as any);
    const pool = createMockPool();
    // 用户选了 country=CN 但机构隐含国家=US → 冲突
    const result = await buildFilterPlan(pool, {
      ...baseParams, country: "CN", agency: "SOME_AGENCY",
    } as any);
    expect(result.conflictEmpty).toBe(true);
  });

  it("机构 FORCE_COUNTRY 与用户国家一致 → 不冲突", async () => {
    vi.mocked(getAgencyCacheData).mockReturnValue([
      { agency: "US_AGENCY", agencyGroup: "FORCE_COUNTRY_US" },
    ] as any);
    const pool = createMockPool();
    const result = await buildFilterPlan(pool, {
      ...baseParams, country: "US", agency: "US_AGENCY",
    } as any);
    expect(result.conflictEmpty).toBe(false);
  });
});
