/**
 * 行业检索口径 — 把行业面树铺给下拉筛选与关键词页签
 * Industry Facets & Keyword Resolution
 *
 * @module lib/services/industry-facets
 * @description 旧做法是把整页供应商拉回前端、对 `supplier.industry` 自由文本去重
 *              （2026-10-09 实测：全库可见供应商 36 家，去重出 20 种字符串，其中
 *              「其他 / Other」这类自造值还占着高频位）。本模块改为读权威树：
 *                - facet（下拉）：门类作 optgroup + 大类子项，带子树内可见供应商数；
 *                - 关键词（行业页签）：先把词解析成命中的行业节点集，再按子树筛供应商
 *                  （官方名优先、释义兜底，避免细分词被枚举型释义冲到粗层）。
 *
 *              两种口径都只认树，不退回自由文本 LIKE。2026-10-09 真库拿 21 个关键词跑生产
 *              代码路径对比文本口径：树净多召回 28 次（全部英文关键词、「制造业」这类官方术语），
 *              文本独有 21 次——抽查其中 5 个关键词的 14 次逐家核实：10 家根本没码
 *              （主码 NULL 且无挂靠），4 家码与自填文本本来就不是一回事
 *              （自填「农业/农机」的两家码是纺织业 0305，自填「建筑工程」的两家码是
 *              玻璃制造 031804、结构性金属制品 032101）。
 *              并集会把这两类东西永久留在检索路径上，所以不做；缺口用空结果说明显式告知用户。
 */
import { industryAncestorCodes, minimalSubtreePrefixes } from "./industry-code";
import type { IndustryFacetRow, IndustryNodeRepo } from "../repos/industry-node.repo";

export interface IndustryFacetOption {
  code: string;
  nameZh: string;
  nameEn: string;
  /** 子树内门户可见供应商数（与 /api/suppliers?industry_code= 的返回口径一致） */
  suppliers: number;
}

export interface IndustryFacetGroup extends IndustryFacetOption {
  children: IndustryFacetOption[];
}

function toOption(row: IndustryFacetRow): IndustryFacetOption | null {
  const nameZh = String(row.name_zh ?? "").trim();
  const nameEn = String(row.name_en ?? "").trim();
  // 双语名全空的节点宁可不给选项，也不把 UGT-I-xxxx 透到界面上
  if (!nameZh && !nameEn) return null;
  return {
    code: row.code,
    nameZh: nameZh || nameEn,
    nameEn: nameEn || nameZh,
    suppliers: Number(row.suppliers ?? 0),
  };
}

/**
 * 纯拼装：门类列表 + 大类列表 → 带子项的门类组。
 * 归属由码祖先推导（码长即层级，见 industry-code），大类按供应商数降序、门类同理。
 * 没有大类子项的门类整组丢弃——它在下拉里只能点出空结果。
 */
export function buildIndustryFacetGroups(
  sectionRows: readonly IndustryFacetRow[],
  divisionRows: readonly IndustryFacetRow[],
): IndustryFacetGroup[] {
  const sections = sectionRows.map(toOption).filter((x): x is IndustryFacetOption => x !== null);
  const divisions = divisionRows.map(toOption).filter((x): x is IndustryFacetOption => x !== null);

  const groups = new Map<string, IndustryFacetGroup>();
  for (const s of sections) {
    groups.set(s.code, { ...s, children: [] });
  }
  for (const d of divisions) {
    const parent = industryAncestorCodes(d.code)[0];
    const group = parent ? groups.get(parent) : undefined;
    if (!group) continue; // 大类计数大于 0 时其门类必然也大于 0；真出现说明树处于中间态，跳过而非崩接口
    group.children.push(d);
  }

  return [...groups.values()]
    .filter((g) => g.children.length > 0)
    .map((g) => ({ ...g, children: g.children.sort((a, b) => b.suppliers - a.suppliers || a.code.localeCompare(b.code)) }))
    .sort((a, b) => b.suppliers - a.suppliers || a.code.localeCompare(b.code));
}

/** 读两层 facet 并拼装（门类 + 大类各一次递归 CTE，命中 idx_level/idx_parent） */
export async function loadIndustryFacets(repo: IndustryNodeRepo): Promise<IndustryFacetGroup[]> {
  const [sectionRows, divisionRows] = await Promise.all([
    repo.listFacets("section"),
    repo.listFacets("division"),
  ]);
  return buildIndustryFacetGroups(sectionRows, divisionRows);
}

/**
 * 关键词 → 行业子树码集（「行业」页签的检索口径）。
 *
 * 两级命中，官方名优先：释义（`description`）是国标对「本层包括哪些活动」的枚举，
 * 细分词会连带命中它的整个门类/大类——2026-10-09 真库实测「照明」因 门类03 释义里列了
 * 照明器具而回成整个制造业的 13 家。所以释义只在官方名一个都没命中时才当兜底。
 *
 * 返回的是**最小前缀集合**：命中节点的祖先若已入选，子孙被覆盖后丢弃，上限 40 条。
 * 空数组是合法且有意的设计结果：树里没这个词，就是没结果，
 * 调用方不得拿它当「退回文本 LIKE」的信号（那会把脏数据重新引回检索）。
 */
export async function resolveIndustryKeywordCodes(
  repo: IndustryNodeRepo,
  keyword: string,
): Promise<string[]> {
  const byName = await repo.searchNodesByName(keyword);
  if (byName.length > 0) return minimalSubtreePrefixes(byName.map((n) => n.code));
  const byDescription = await repo.searchNodesByKeyword(keyword);
  return minimalSubtreePrefixes(byDescription.map((n) => n.code));
}
