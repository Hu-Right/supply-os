/**
 * 行业主轴与关键词解析测试
 * @module tests/unit/lib/services/industry-facets.test.ts
 * @description facet 现在只铺门类一层，它的硬规矩：
 *              1. 可见供应商多的排前面（用户第一眼就看到能筛出东西的 chip）；
 *              2. 双语名全空的节点不进 chip——宁可不给，也不把 UGT-I-xxxx 透到界面上。
 *              另钉行业词框的解析口径：官方名优先、释义只兜底，命中节点往最小前缀集压，
 *              解不出节点就交空集（上层据此出「无结果」，而不是摸回自由文本）。
 */
import { describe, it, expect, vi } from "vitest";
import { buildIndustrySections, loadIndustryFacets, resolveIndustryKeywordCodes } from "@/lib/services/industry-facets";
import type { IndustryFacetRow } from "@/lib/repos/industry-node.repo";

function row(code: string, nameZh: string | null, nameEn: string | null, suppliers: number): IndustryFacetRow {
  return { code, name_zh: nameZh, name_en: nameEn, suppliers } as IndustryFacetRow;
}

describe("buildIndustrySections — 行业主轴（门类一层）", () => {
  it("按可见供应商数降序，同数按码序（顺序稳定，不会每次刷新就跳位）", () => {
    const rows = buildIndustrySections([
      row("UGT-I-07", "交通运输、仓储和邮政业", "Transportation and storage", 1),
      row("UGT-I-03", "制造业", "Manufacturing", 13),
      row("UGT-I-05", "建筑业", "Construction", 1),
    ]);
    expect(rows.map((r) => r.code)).toEqual(["UGT-I-03", "UGT-I-05", "UGT-I-07"]);
    expect(rows[0].suppliers).toBe(13);
  });

  it("双语名全空的节点不生成 chip；只缺一种时用另一种兜底", () => {
    const rows = buildIndustrySections([
      row("UGT-I-03", "制造业", null, 7),
      row("UGT-I-05", null, null, 3),
    ]);
    expect(rows.map((r) => r.code)).toEqual(["UGT-I-03"]);
    // nameEn 缺失时用中文名占位，而不是给界面一个空标签
    expect(rows[0].nameEn).toBe("制造业");
  });

  it("空行集→空数组（零挂靠的门类本层收不到，不造假 chip）", () => {
    expect(buildIndustrySections([])).toEqual([]);
  });
});

describe("loadIndustryFacets — 只铺门类一层", () => {
  it("只发一条 section 查询：大类递归 CTE 已摘掉，且不得再查 division", async () => {
    const listFacets = vi.fn().mockResolvedValue([row("UGT-I-03", "制造业", "Manufacturing", 13)]);
    const rows = await loadIndustryFacets({ listFacets } as never);
    expect(listFacets).toHaveBeenCalledTimes(1);
    expect(listFacets).toHaveBeenCalledWith("section");
    expect(rows.map((r) => r.code)).toEqual(["UGT-I-03"]);
  });
});

describe("resolveIndustryKeywordCodes — 「行业」页签的树口径", () => {
  it("官方名命中 → 直接用官方名结果，不再查释义（释义是枚举，会把「照明」冲到整个制造业）", async () => {
    const searchNodesByName = vi.fn().mockResolvedValue([
      { code: "UGT-I-03" },
      { code: "UGT-I-0326" },
      { code: "UGT-I-03260701" },
      { code: "UGT-I-0317" },
    ]);
    const searchNodesByKeyword = vi.fn();
    const repo = { searchNodesByName, searchNodesByKeyword } as never;
    expect(await resolveIndustryKeywordCodes(repo, "制造")).toEqual(["UGT-I-03"]);
    expect(searchNodesByName).toHaveBeenCalledWith("制造");
    expect(searchNodesByKeyword).not.toHaveBeenCalled();
  });

  it("官方名全空 → 释义兜底（树里只在释义里出现过的词也能搜到）", async () => {
    const searchNodesByName = vi.fn().mockResolvedValue([]);
    const searchNodesByKeyword = vi.fn().mockResolvedValue([{ code: "UGT-I-032607" }, { code: "UGT-I-0326" }]);
    const repo = { searchNodesByName, searchNodesByKeyword } as never;
    expect(await resolveIndustryKeywordCodes(repo, "安防")).toEqual(["UGT-I-0326"]);
    expect(searchNodesByKeyword).toHaveBeenCalledWith("安防");
  });

  it("两级都解不到 → 空集，不是 undefined（调用方拿它筛=无结果，不会默默退文本）", async () => {
    const repo = {
      searchNodesByName: vi.fn().mockResolvedValue([]),
      searchNodesByKeyword: vi.fn().mockResolvedValue([]),
    } as never;
    expect(await resolveIndustryKeywordCodes(repo, "家具")).toEqual([]);
  });

  it("字典层报错不能变成「退回旧口径」：错照样上抛，由路由收成无命中", async () => {
    const repo = { searchNodesByName: vi.fn().mockRejectedValue(new Error("db down")) } as never;
    await expect(resolveIndustryKeywordCodes(repo, "机械")).rejects.toThrow("db down");
  });
});
