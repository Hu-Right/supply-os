import { describe, it, expect, vi } from "vitest";

// Mock 外部依赖
vi.mock("@/lib/services/notice-search/agencies/index", () => ({
  getAgencyCacheData: () => null,
}));
vi.mock("@/lib/services/agency/index", () => ({
  classifyAgencyType: () => null,
}));
vi.mock("@/lib/data/agency-i18n/translate", () => ({
  translateByPattern: () => null,
}));

import { matchScoreToTierLabel, formatItems } from "@/lib/services/search-orchestrator/format";

describe("matchScoreToTierLabel", () => {
  it("score ≥ 5 → precise", () => {
    expect(matchScoreToTierLabel(5)).toBe("precise");
    expect(matchScoreToTierLabel(10)).toBe("precise");
  });

  it("score ≥ 2 且 < 5 → relevant", () => {
    expect(matchScoreToTierLabel(2)).toBe("relevant");
    expect(matchScoreToTierLabel(4)).toBe("relevant");
  });

  it("score < 2 → unmatched", () => {
    expect(matchScoreToTierLabel(0)).toBe("unmatched");
    expect(matchScoreToTierLabel(1)).toBe("unmatched");
  });
});

describe("formatItems", () => {
  it("空行 → 空数组", () => {
    expect(formatItems([], "en")).toEqual([]);
  });

  it("基础字段映射", () => {
    const rows = [{ id: 1, agency: "UNDP", is_featured: 1 }] as any;
    const result = formatItems(rows, "en");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].is_featured).toBe(true);
    expect(result[0].core_locked).toBe(true);
    expect(result[0].organization).toBeNull();
    expect(result[0].source_url).toBeNull();
    expect(result[0].unspsc_codes).toEqual([]);
  });

  it("profileLevels → 计算 match_score + match_tier", () => {
    const rows = [{ id: 1, precise_level4: "100", precise_level5: "" }] as any;
    const profileLevels = [{ level: 4, id: "100" }];
    const result = formatItems(rows, "en", profileLevels);
    expect(result[0].match_score).toBe(5);
    expect(result[0].match_tier).toBe("precise");
  });

  it("profileLevels 无命中 → 无 match_tier", () => {
    const rows = [{ id: 1, precise_level4: "", precise_level5: "" }] as any;
    const profileLevels = [{ level: 4, id: "999" }];
    const result = formatItems(rows, "en", profileLevels);
    expect(result[0].match_score).toBeUndefined();
    expect(result[0].match_tier).toBeUndefined();
  });

  it("is_featured=0 → false", () => {
    const rows = [{ id: 1, is_featured: 0 }] as any;
    const result = formatItems(rows, "en");
    expect(result[0].is_featured).toBe(false);
  });
});
