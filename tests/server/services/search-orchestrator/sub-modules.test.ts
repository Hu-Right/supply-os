/**
 * server/services/search-orchestrator/ 子模块测试
 * 覆盖 format.ts (matchScoreToTierLabel, formatItems), mode-resolver.ts, detail-fetch.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── format.ts — matchScoreToTierLabel ──
import { matchScoreToTierLabel, formatItems } from "../../../../server/services/search-orchestrator/format";

// mock getAgencyCacheData（format.ts 内部调用）
vi.mock("../../../../server/services/notice-search/agencies/index", () => ({
  getAgencyCacheData: vi.fn(() => null),
}));

// mock normalizeDocumentRows（format.ts 内部调用）
vi.mock("../../../../server/utils/normalize", () => ({
  normalizeDocumentRows: vi.fn(() => []),
}));

describe("matchScoreToTierLabel", () => {
  it("score >= 5 → precise", () => {
    expect(matchScoreToTierLabel(5)).toBe("precise");
    expect(matchScoreToTierLabel(10)).toBe("precise");
  });

  it("score >= 2 → relevant", () => {
    expect(matchScoreToTierLabel(2)).toBe("relevant");
    expect(matchScoreToTierLabel(4)).toBe("relevant");
  });

  it("score < 2 → unmatched", () => {
    expect(matchScoreToTierLabel(0)).toBe("unmatched");
    expect(matchScoreToTierLabel(1)).toBe("unmatched");
    expect(matchScoreToTierLabel(-1)).toBe("unmatched");
  });
});

// ── format.ts — formatItems ──
import { getAgencyCacheData } from "../../../../server/services/notice-search/agencies/index";

describe("formatItems", () => {
  beforeEach(() => {
    vi.mocked(getAgencyCacheData).mockReturnValue(null);
  });

  it("空行 → 空数组", () => {
    expect(formatItems([], "zh")).toEqual([]);
  });

  it("基础行：is_featured=true → true，organization/source_url 为 null", () => {
    const rows = [{ id: 1, agency: "UNDP", is_featured: 1 }];
    const items = formatItems(rows as any, "zh");
    expect(items).toHaveLength(1);
    expect(items[0].is_featured).toBe(true);
    expect(items[0].organization).toBeNull();
    expect(items[0].source_url).toBeNull();
    expect(items[0].unspsc_codes).toEqual([]);
    expect(items[0].core_locked).toBe(true);
  });

  it("is_featured=0 → false", () => {
    const rows = [{ id: 2, is_featured: 0 }];
    const items = formatItems(rows as any, "en");
    expect(items[0].is_featured).toBe(false);
  });

  it("有机构缓存 → agency_i18n 取对应 locale", () => {
    vi.mocked(getAgencyCacheData).mockReturnValue([
      { agency: "UNDP", i18n: { zh: "联合国开发计划署", en: "UN Development Programme" } },
    ] as any);
    const rows = [{ id: 3, agency: "undp" }];
    const itemsZh = formatItems(rows as any, "zh");
    expect(itemsZh[0].agency_i18n).toBe("联合国开发计划署");

    const itemsEn = formatItems(rows as any, "en");
    expect(itemsEn[0].agency_i18n).toBe("UN Development Programme");
  });

  it("agency_group 回退查找", () => {
    vi.mocked(getAgencyCacheData).mockReturnValue([
      { agency: "MUNICIPIO_BR", i18n: { zh: "巴西市政府" } },
    ] as any);
    const rows = [{ id: 4, agency: "MUNICIPIO_X", agency_group: "MUNICIPIO_BR" }];
    const items = formatItems(rows as any, "zh");
    expect(items[0].agency_i18n).toBe("巴西市政府");
  });

  it("breakdown_file_count 直取宽表字段", () => {
    const rows = [{ id: 5, breakdown_file_count: 3 }];
    const items = formatItems(rows as any, "zh");
    expect(items[0].breakdown_file_count).toBe(3);
  });

  it("profileLevels → 计算 match_score/match_tier", () => {
    const rows = [{ id: 6, precise_level4: "100,200", precise_level5: "" }];
    const profileLevels = [{ level: 4, id: "200" }];
    const items = formatItems(rows as any, "zh", profileLevels);
    expect(items[0].match_score).toBe(5);
    expect(items[0].match_tier).toBe("precise");
  });

  it("profileLevels 无命中 → 不设 match_score", () => {
    const rows = [{ id: 7, precise_level2: "", precise_level3: "" }];
    const profileLevels = [{ level: 3, id: "999" }];
    const items = formatItems(rows as any, "zh", profileLevels);
    expect(items[0].match_score).toBeUndefined();
    expect(items[0].match_tier).toBeUndefined();
  });
});

// ── mode-resolver.ts — resolveMode ──
import { resolveMode } from "../../../../server/services/search-orchestrator/mode-resolver";

// mock resolveUserIndustryProfile
vi.mock("../../../../server/services/industry-profile/resolve", () => ({
  resolveUserIndustryProfile: vi.fn(),
}));

import { resolveUserIndustryProfile } from "../../../../server/services/industry-profile/resolve";

function mockPool(queryResult?: any[]) {
  return {
    query: vi.fn().mockResolvedValue([queryResult || []]),
  } as any;
}

const baseParams = {
  mode: "default" as const,
  userKey: "",
  page: 1,
  pageSize: 20,
  locale: "zh",
  q: "",
  country: "",
  agency: "",
  deadlineFrom: "",
  deadlineTo: "",
  deadlineWithinDays: 0,
  noticeType: "",
  featuredOnly: false,
  sort: "deadline_farthest" as const,
  codeId: 0,
};

describe("resolveMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recommended → delegate-recommended", async () => {
    const pool = mockPool();
    const result = await resolveMode(pool, { ...baseParams, mode: "recommended" });
    expect(result.kind).toBe("delegate-recommended");
    expect(result.codeUnspsc).toBeNull();
    expect(result.profileLevels).toBeNull();
  });

  it("prefs + 无 userKey → no-prefs", async () => {
    const pool = mockPool();
    const result = await resolveMode(pool, { ...baseParams, mode: "prefs", userKey: "" });
    expect(result.kind).toBe("no-prefs");
  });

  it("prefs + 无行业偏好 → no-prefs", async () => {
    vi.mocked(resolveUserIndustryProfile).mockResolvedValue(null);
    const pool = mockPool();
    const result = await resolveMode(pool, { ...baseParams, mode: "prefs", userKey: "u1" });
    expect(result.kind).toBe("no-prefs");
  });

  it("prefs + L4 偏好 → search + profileLevels", async () => {
    vi.mocked(resolveUserIndustryProfile).mockResolvedValue({
      userKey: "u1",
      deepestLevel: 4,
      levelIds: [10, 20, 30, 40, null],
      deepestId: 40,
      branchPrefix: "4214",
      industryTitleZh: "测试行业",
    });
    const pool = mockPool();
    const result = await resolveMode(pool, { ...baseParams, mode: "prefs", userKey: "u1" });
    expect(result.kind).toBe("search");
    expect(result.profileLevels).toHaveLength(3); // L4, L3, L2
    expect(result.profileLevels![0]).toEqual({ level: 4, id: "40", score: 5 });
    expect(result.profileLevels![1]).toEqual({ level: 3, id: "30", score: 2 });
    expect(result.profileLevels![2]).toEqual({ level: 2, id: "20", score: 2 });
  });

  it("prefs + 仅 L1 偏好 → no-prefs（L1 太宽泛）", async () => {
    vi.mocked(resolveUserIndustryProfile).mockResolvedValue({
      userKey: "u2",
      deepestLevel: 1,
      levelIds: [10, null, null, null, null],
      deepestId: 10,
      branchPrefix: null,
      industryTitleZh: "大类",
    });
    const pool = mockPool();
    const result = await resolveMode(pool, { ...baseParams, mode: "prefs", userKey: "u2" });
    expect(result.kind).toBe("no-prefs");
  });

  it("default + codeId=0 → search, codeUnspsc=null", async () => {
    const pool = mockPool();
    const result = await resolveMode(pool, { ...baseParams, codeId: 0 });
    expect(result.kind).toBe("search");
    expect(result.codeUnspsc).toBeNull();
  });

  it("default + codeId>0 + DB 返回有效 level → codeUnspsc", async () => {
    const pool = mockPool([{ id: 42, level: 3 }]);
    const result = await resolveMode(pool, { ...baseParams, codeId: 42 });
    expect(result.kind).toBe("search");
    expect(result.codeUnspsc).toEqual({ level: 3, id: "42", precise: false });
  });

  it("default + codeId>0 + DB 返回空 → codeUnspsc=null", async () => {
    const pool = mockPool([]);
    const result = await resolveMode(pool, { ...baseParams, codeId: 99 });
    expect(result.kind).toBe("search");
    expect(result.codeUnspsc).toBeNull();
  });

  it("default + codeId>0 + DB 查询异常 → 忽略，codeUnspsc=null", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("DB error")) } as any;
    const result = await resolveMode(pool, { ...baseParams, codeId: 42 });
    expect(result.kind).toBe("search");
    expect(result.codeUnspsc).toBeNull();
  });

  it("default + codeId>0 + level 超出范围 → codeUnspsc=null", async () => {
    const pool = mockPool([{ id: 42, level: 0 }]);
    const result = await resolveMode(pool, { ...baseParams, codeId: 42 });
    expect(result.kind).toBe("search");
    expect(result.codeUnspsc).toBeNull();
  });
});

// ── detail-fetch.ts — fetchDetailsByIds ──
import { fetchDetailsByIds } from "../../../../server/services/search-orchestrator/detail-fetch";

// mock isWideTableReady
vi.mock("../../../../server/services/search-sync/index", () => ({
  isWideTableReady: vi.fn(),
}));

import { isWideTableReady } from "../../../../server/services/search-sync/index";

describe("fetchDetailsByIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("空 ids → 空数组", async () => {
    const pool = mockPool();
    const result = await fetchDetailsByIds(pool, [], "zh");
    expect(result).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("不支持的 locale → 回退 en", async () => {
    vi.mocked(isWideTableReady).mockResolvedValue(true);
    const pool = mockPool([{ id: 1 }]);
    await fetchDetailsByIds(pool, [1], "xx");
    // 宽表路径：SQL 应包含 title_en
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("title_en");
  });

  it("宽表就绪 → 使用 crm_notice_search", async () => {
    vi.mocked(isWideTableReady).mockResolvedValue(true);
    const pool = mockPool([{ id: 1 }, { id: 2 }]);
    const result = await fetchDetailsByIds(pool, [1, 2], "zh");
    expect(result).toHaveLength(2);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("crm_notice_search");
    expect(sql).toContain("title_zh");
  });

  it("宽表未就绪 → 回退多表 JOIN", async () => {
    vi.mocked(isWideTableReady).mockResolvedValue(false);
    const pool = mockPool([{ id: 1 }]);
    const result = await fetchDetailsByIds(pool, [1], "fr");
    expect(result).toHaveLength(1);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("crm_bid_notices n");
    expect(sql).toContain("crm_notice_translations tr");
  });

  it("locale 为空 → 回退 en", async () => {
    vi.mocked(isWideTableReady).mockResolvedValue(true);
    const pool = mockPool([{ id: 1 }]);
    await fetchDetailsByIds(pool, [1], "");
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("title_en");
  });
});
