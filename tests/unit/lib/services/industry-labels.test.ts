/**
 * 行业标签批量装配测试
 * @module tests/unit/lib/services/industry-labels.test.ts
 * @description 门户一页 8 家供应商，行业标签必须是「一次挂靠查 + 一次节点查」，
 *              不能退化成逐家往返。同时钉住三条展示口径：
 *              主码标签排第一、路径按祖先链展开、码在树里查不到就不给标签
 *              （宁缺毋滥，绝不把 UGT-I-xxxx 透给用户，也不让详情页因为字典中间态报错）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSupplierIndustryInfo } from "@/lib/services/industry-labels";
import type { IndustryNodeRepo } from "@/lib/repos/industry-node.repo";

const NODES = [
  { code: "UGT-I-03", name_zh: "制造业", name_en: "Manufacturing", level: "section", parent_code: null },
  { code: "UGT-I-0326", name_zh: "电气机械和器材制造业", name_en: "Manufacture of electrical equipment", level: "division", parent_code: "UGT-I-03" },
  { code: "UGT-I-032607", name_zh: "照明器具制造", name_en: "Manufacture of electric lighting equipment", level: "group", parent_code: "UGT-I-0326" },
  { code: "UGT-I-032604", name_zh: "其他电气机械制造", name_en: "Other electrical machinery", level: "group", parent_code: "UGT-I-0326" },
  // 真库实测形态：ISIC 比国标粗，子类与父类官方名完全同名（全表 568/2,060 行如此）
  { code: "UGT-I-01", name_zh: "农、林、牧、渔业", name_en: "Agriculture, forestry and fishing", level: "section", parent_code: null },
  { code: "UGT-I-0102", name_zh: "林业", name_en: "Agriculture, forestry and fishing", level: "division", parent_code: "UGT-I-01" },
];

function makeRepo(links: Array<{ supplier_id: number; industry_code: string }>) {
  const findNodesByCodes = vi.fn(async (codes: readonly string[]) =>
    NODES.filter((n) => (codes as string[]).includes(n.code)),
  );
  const listLinksBySupplierIds = vi.fn(async () => links);
  return {
    repo: { findNodesByCodes, listLinksBySupplierIds } as unknown as IndustryNodeRepo,
    findNodesByCodes,
    listLinksBySupplierIds,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("loadSupplierIndustryInfo", () => {
  it("有主码：给出双语主标签 + 门类到自身的四级路径 + 主码排第一的多行业标签", async () => {
    const { repo, findNodesByCodes, listLinksBySupplierIds } = makeRepo([
      { supplier_id: 3, industry_code: "UGT-I-032604" },
      { supplier_id: 3, industry_code: "UGT-I-032607" },
    ]);
    const info = await loadSupplierIndustryInfo(repo, [{ id: 3, industry_code: "UGT-I-032607" }]);

    const one = info.get(3)!;
    expect(one.primary).toEqual({ code: "UGT-I-032607", nameZh: "照明器具制造", nameEn: "Manufacture of electric lighting equipment" });
    expect(one.pathZh).toEqual(["制造业", "电气机械和器材制造业", "照明器具制造"]);
    expect(one.pathEn[1]).toBe("Manufacture of electrical equipment");
    expect(one.tags.map((t) => t.code)).toEqual(["UGT-I-032607", "UGT-I-032604"]);

    // 整页只做两次往返：一次取挂靠、一次取节点（含祖先）
    expect(listLinksBySupplierIds).toHaveBeenCalledTimes(1);
    expect(findNodesByCodes).toHaveBeenCalledTimes(1);
  });

  it("标签上限 3 个：挂靠再多也不把卡片变成标签堆", async () => {
    const { repo } = makeRepo([
      { supplier_id: 7, industry_code: "UGT-I-032604" },
      { supplier_id: 7, industry_code: "UGT-I-032607" },
      { supplier_id: 7, industry_code: "UGT-I-0326" },
      { supplier_id: 7, industry_code: "UGT-I-03" },
    ]);
    const info = await loadSupplierIndustryInfo(repo, [{ id: 7, industry_code: "UGT-I-032607" }]);
    expect(info.get(7)!.tags).toHaveLength(3);
    expect(info.get(7)!.tags[0].code).toBe("UGT-I-032607");
  });

  it("主码在树里查不到（字典中间态）→ primary 为 null，由调用方回落自填文本", async () => {
    const { repo } = makeRepo([]);
    const info = await loadSupplierIndustryInfo(repo, [{ id: 9, industry_code: "UGT-I-999999" }]);
    const one = info.get(9)!;
    expect(one.primary).toBeNull();
    expect(one.tags).toEqual([]);
    expect(one.pathZh).toEqual([]);
  });

  it("与父节点同官方名时不重复堆层：EN 路径相邻同名折叠，中文照旧", async () => {
    const { repo } = makeRepo([{ supplier_id: 21, industry_code: "UGT-I-0102" }]);
    const info = await loadSupplierIndustryInfo(repo, [{ id: 21, industry_code: "UGT-I-0102" }]);
    const one = info.get(21)!;
    expect(one.pathZh).toEqual(["农、林、牧、渔业", "林业"]);
    // 两层英文名字面相同，悬浮提示里写两遍不会多出任何信息
    expect(one.pathEn).toEqual(["Agriculture, forestry and fishing"]);
  });

  it("不同名的层不得被误删：三级互不相同就保留三段", async () => {
    const { repo } = makeRepo([{ supplier_id: 22, industry_code: "UGT-I-032607" }]);
    const info = await loadSupplierIndustryInfo(repo, [{ id: 22, industry_code: "UGT-I-032607" }]);
    expect(info.get(22)!.pathEn).toHaveLength(3);
  });

  it("无主码但有挂靠：不凭空造主标签（主标签口径只有 supplier.industry_code）", async () => {
    const { repo } = makeRepo([{ supplier_id: 11, industry_code: "UGT-I-032607" }]);
    const info = await loadSupplierIndustryInfo(repo, [{ id: 11, industry_code: null }]);
    expect(info.get(11)!.primary).toBeNull();
  });

  it("整页都没有码：不发节点查询（省掉一次无谓往返）", async () => {
    const { repo, findNodesByCodes } = makeRepo([]);
    const info = await loadSupplierIndustryInfo(repo, [{ id: 1, industry_code: "" }, { id: 2, industry_code: null }]);
    expect(info.get(1)!.primary).toBeNull();
    expect(findNodesByCodes).toHaveBeenCalledWith([]);
  });

  it("空行集直接返回空 Map，不打 SQL", async () => {
    const { repo, listLinksBySupplierIds } = makeRepo([]);
    const info = await loadSupplierIndustryInfo(repo, []);
    expect(info.size).toBe(0);
    expect(listLinksBySupplierIds).not.toHaveBeenCalled();
  });
});
