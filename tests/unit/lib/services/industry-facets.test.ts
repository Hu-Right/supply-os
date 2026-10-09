/**
 * 行业筛选面拼装测试
 * @module tests/unit/lib/services/industry-facets.test.ts
 * @description facet 的两条硬规矩：
 *              1. 大类挂到正确的门类下（由码祖先推导，不靠前端再猜）；
 *              2. 给不出结果的节点不进下拉——空选项点开是空列表，比少一个选项更糟。
 *              排序也要钉住：可见供应商多的排前面，用户第一眼就看到能筛出东西的项。
 *              另钉一条「行业」页签的关键词解析：官方名优先、释义只兜底，
 *              命中节点要往最小前缀集压，解不出节点就交空集（上层据此出「无结果」，
 *              而不是摸回自由文本）。
 */
import { describe, it, expect, vi } from "vitest";
import { buildIndustryFacetGroups, resolveIndustryKeywordCodes } from "@/lib/services/industry-facets";
import type { IndustryFacetRow } from "@/lib/repos/industry-node.repo";

function row(code: string, nameZh: string | null, nameEn: string | null, suppliers: number): IndustryFacetRow {
  return { code, name_zh: nameZh, name_en: nameEn, suppliers } as IndustryFacetRow;
}

describe("buildIndustryFacetGroups", () => {
  it("大类归入其门类祖先，门类作为分组携带自己的子树合计数", () => {
    const groups = buildIndustryFacetGroups(
      [row("UGT-I-03", "制造业", "Manufacturing", 12), row("UGT-I-07", "交通运输、仓储和邮政业", "Transportation and storage", 1)],
      [row("UGT-I-0326", "电气机械和器材制造业", "Manufacture of electrical equipment", 5), row("UGT-I-0702", "道路运输业", "Land transportation", 1)],
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].code).toBe("UGT-I-03"); // 计数大的门类在前
    expect(groups[0].children.map((c) => c.code)).toEqual(["UGT-I-0326"]);
    expect(groups[1].children.map((c) => c.code)).toEqual(["UGT-I-0702"]);
  });

  it("同组内大类按可见供应商数降序，用户先看到有货的", () => {
    const groups = buildIndustryFacetGroups(
      [row("UGT-I-03", "制造业", "Manufacturing", 9)],
      [row("UGT-I-0317", "橡塑", "Rubber and plastics", 2), row("UGT-I-0326", "电气机械", "Electrical equipment", 6)],
    );
    expect(groups[0].children.map((c) => c.code)).toEqual(["UGT-I-0326", "UGT-I-0317"]);
  });

  it("没有任何大类子项的门类整组丢弃（只点得出空结果的分组不进下拉）", () => {
    const groups = buildIndustryFacetGroups([row("UGT-I-05", "建筑业", "Construction", 0)], []);
    expect(groups).toEqual([]);
  });

  it("双语名全空的节点不生成选项——绝不把 UGT-I-xxxx 透给界面", () => {
    const groups = buildIndustryFacetGroups(
      [row("UGT-I-03", "制造业", "Manufacturing", 7)],
      [row("UGT-I-0326", null, null, 3), row("UGT-I-0317", "橡塑", null, 4)],
    );
    // 缺中文名的节点用英文名兜；两个都缺才丢弃（所以 UGT-I-0326 不进下拉）
    expect(groups[0].children.map((c) => c.code)).toEqual(["UGT-I-0317"]);
    expect(groups[0].children[0].nameEn).toBe("橡塑");
  });

  it("大类有计数而其门类缺失（树处于中间态）→ 跳过该大类而不是崩接口", () => {
    const groups = buildIndustryFacetGroups([], [row("UGT-I-0326", "电气机械", "Electrical", 3)]);
    expect(groups).toEqual([]);
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
