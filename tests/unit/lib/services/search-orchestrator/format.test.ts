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

  it("画像节点码命中公告 precise 链 → match_score + match_tier", () => {
    const rows = [{ id: 1, precise_backbone_path: "UGT-B-43,UGT-B-4321,UGT-B-432115,UGT-B-43211503" }] as any;
    const profileNodes = [{ level: 4, node: "UGT-B-43211503" }];
    const result = formatItems(rows, "en", profileNodes);
    expect(result[0].match_score).toBe(5);
    expect(result[0].match_tier).toBe("precise");
  });

  it("深浅两档同时命中 → 取最深档定分（放宽到 L2 也不能把精准命中降成 relevant）", () => {
    const rows = [{ id: 1, precise_backbone_path: "UGT-B-43,UGT-B-4321,UGT-B-432115,UGT-B-43211503" }] as any;
    const profileNodes = [
      { level: 4, node: "UGT-B-43211503" },
      { level: 2, node: "UGT-B-4321" },
    ];
    expect(formatItems(rows, "en", profileNodes)[0].match_score).toBe(5);
  });

  it("precise 链不含任何一档节点码 / 列为空 → 不挂徽章", () => {
    const miss = [{ id: 1, precise_backbone_path: "UGT-B-30,UGT-B-3011" }] as any;
    const result = formatItems(miss, "en", [{ level: 4, node: "UGT-B-43211503" }]);
    expect(result[0].match_score).toBeUndefined();
    expect(result[0].match_tier).toBeUndefined();
    // 降级多表 JOIN 路径的行根本没有这一列：同样不挂徽章，不能因为 undefined 就报错
    const noCol = [{ id: 2 }] as any;
    expect(formatItems(noCol, "en", [{ level: 2, node: "UGT-B-43" }])[0].match_tier).toBeUndefined();
  });

  it("列里的脏 token 不参与命中：只认 UGT-B- 形制的码", () => {
    const rows = [{ id: 1, precise_backbone_path: "721015,UGT-B-XY" }] as any;
    const result = formatItems(rows, "en", [{ level: 2, node: "721015" }, { level: 3, node: "UGT-B-XY" }]);
    expect(result[0].match_tier).toBeUndefined();
  });

  it("is_featured=0 → false", () => {
    const rows = [{ id: 1, is_featured: 0 }] as any;
    const result = formatItems(rows, "en");
    expect(result[0].is_featured).toBe(false);
  });
});
