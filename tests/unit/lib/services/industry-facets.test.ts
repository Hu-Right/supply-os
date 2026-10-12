/**
 * 行业级联树读取与关键词解析测试
 * @module tests/unit/lib/services/industry-facets.test.ts
 * @description 级联下拉读**完整分类树**，它的硬规矩：
 *              1. 门类一层与第 2~4 级都返回 {key,nameZh,nameEn}，key 就是可直接下筛的节点码；
 *              2. 双语名全空的节点不进下拉——宁可不给，也不把 UGT-I-xxxx 透到界面上；
 *              3. 不再按供应商数过滤（repo 返回啥就映射啥，空集交上层出「无结果」）。
 *              另钉行业词检索的解析口径：官方名优先、释义只兜底，命中节点往最小前缀集压，
 *              解不出节点就交空集（上层据此出「无结果」，而不是摸回自由文本）。
 */
import { describe, it, expect, vi } from "vitest";
import { loadIndustrySections, loadIndustryChildren, resolveIndustryKeywordCodes } from "@/lib/services/industry-facets";
import type { IndustryNodeRow } from "@/lib/repos/industry-node.repo";

function node(code: string, nameZh: string | null, nameEn: string | null): IndustryNodeRow {
  return { code, name_zh: nameZh, name_en: nameEn, level: "section", parent_code: null } as IndustryNodeRow;
}

describe("loadIndustrySections — 门类一层（完整树）", () => {
  it("只发一条 section 查询，返回 {key,nameZh,nameEn}（key=节点码）", async () => {
    const listNodesByLevel = vi.fn().mockResolvedValue([node("UGT-I-03", "制造业", "Manufacturing")]);
    const opts = await loadIndustrySections({ listNodesByLevel } as never);
    expect(listNodesByLevel).toHaveBeenCalledTimes(1);
    expect(listNodesByLevel).toHaveBeenCalledWith("section");
    expect(opts).toEqual([{ key: "UGT-I-03", nameZh: "制造业", nameEn: "Manufacturing" }]);
  });

  it("双语名全空的节点丢弃；只缺一种时用另一种兜底", async () => {
    const listNodesByLevel = vi.fn().mockResolvedValue([
      node("UGT-I-03", "制造业", null),
      node("UGT-I-05", null, null),
    ]);
    const opts = await loadIndustrySections({ listNodesByLevel } as never);
    expect(opts.map((o) => o.key)).toEqual(["UGT-I-03"]);
    expect(opts[0].nameEn).toBe("制造业");
  });

  it("空行集→空数组（不造假选项）", async () => {
    const listNodesByLevel = vi.fn().mockResolvedValue([]);
    expect(await loadIndustrySections({ listNodesByLevel } as never)).toEqual([]);
  });
});

describe("loadIndustryChildren — 级联下一层（大类/中类/小类）", () => {
  it("把父码的全部直接子级翻成 {key,nameZh,nameEn}，零挂靠子级不再被过滤掉", async () => {
    const listChildNodes = vi.fn().mockResolvedValue([
      node("UGT-I-0326", "电气机械和器材制造业", "Manufacture of electrical equipment"),
      node("UGT-I-0327", "计算机、通信和其他电子设备制造业", null),
    ]);
    const opts = await loadIndustryChildren({ listChildNodes } as never, "UGT-I-03");
    expect(listChildNodes).toHaveBeenCalledWith("UGT-I-03");
    expect(opts.map((o) => o.key)).toEqual(["UGT-I-0326", "UGT-I-0327"]);
    // 英文名缺失时用中文名兜底，不给界面一个空标签
    expect(opts[1].nameEn).toBe("计算机、通信和其他电子设备制造业");
  });

  it("双语名全空的子级丢弃（宁可不给选项，也不把 UGT-I-xxxx 透到界面）", async () => {
    const listChildNodes = vi.fn().mockResolvedValue([
      node("UGT-I-0326", "电气机械", "Electrical"),
      node("UGT-I-0327", null, null),
    ]);
    const opts = await loadIndustryChildren({ listChildNodes } as never, "UGT-I-03");
    expect(opts.map((o) => o.key)).toEqual(["UGT-I-0326"]);
  });

  it("父码无子级 → 空数组（上层据此让该级下拉留空，不造假选项）", async () => {
    const listChildNodes = vi.fn().mockResolvedValue([]);
    expect(await loadIndustryChildren({ listChildNodes } as never, "UGT-I-03")).toEqual([]);
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
