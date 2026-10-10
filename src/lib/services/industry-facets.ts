/**
 * 行业检索口径 — 行业主轴（门类 chip）与行业关键词解析
 * Industry Facets & Keyword Resolution
 *
 * @module lib/services/industry-facets
 * @description 旧做法是把整页供应商拉回前端、对 `supplier.industry` 自由文本去重
 *              （2026-10-09 实测：全库可见供应商 36 家，去重出 20 种字符串，其中
 *              「其他 / Other」这类自造值还占着高频位）。本模块改为读权威树，提供两个口子：
 *                - facet（行业主轴）：只铺**门类一层**，带子树内可见供应商数；
 *                - 关键词（行业词框）：先把词解析成命中的行业节点集，再按子树筛供应商
 *                  （官方名优先、释义兜底，避免细分词被枚举型释义冲到粗层）。
 *
 *              为什么只铺门类一层（2026-10-10 定稿）：大类以下的点选路径由关键词框接——
 *              输「电气机械」就能落到 `UGT-I-0326` 子树，不比下拉少能力；而英文侧有 37 个
 *              大类与门类同名（ISIC 粒度比国标粗，见表文档「已知缺陷」），铺成 chip 只会把
 *              一堆 `Manufacturing` 摆在用户脸上。
 *
 *              两种口径都只认树，不退回自由文本 LIKE。2026-10-09 真库拿 21 个关键词跑生产
 *              代码路径对比文本口径：树净多召回 28 次（全部英文关键词、「制造业」这类官方术语），
 *              文本独有 21 次——抽查其中 5 个关键词的 14 次逐家核实：10 家根本没码
 *              （主码 NULL 且无挂靠），4 家码与自填文本本来就不是一回事
 *              （自填「农业/农机」的两家码是纺织业 0305，自填「建筑工程」的两家码是
 *              玻璃制造 031804、结构性金属制品 032101）。
 *              并集会把这两类东西永久留在检索路径上，所以不做；缺口用空结果说明显式告知用户。
 */
import { minimalSubtreePrefixes } from "./industry-code";
import type { IndustryFacetRow, IndustryNodeRepo } from "../repos/industry-node.repo";

export interface IndustryFacetOption {
  code: string;
  nameZh: string;
  nameEn: string;
  /** 子树内门户可见供应商数（与 /api/suppliers?industry_code= 的返回口径一致） */
  suppliers: number;
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
 * 纯拼装：门类 facet 行 → 行业主轴选项。按可见供应商数降序、同数按码序。
 * 双语名全空的节点丢弃（宁可不给 chip，也不把 UGT-I-xxxx 透给界面）；
 * 零挂靠的门类本层不会收到（SQL 里 `HAVING suppliers > 0` 已滤掉）。
 */
export function buildIndustrySections(rows: readonly IndustryFacetRow[]): IndustryFacetOption[] {
  return rows
    .map(toOption)
    .filter((x): x is IndustryFacetOption => x !== null)
    .sort((a, b) => b.suppliers - a.suppliers || a.code.localeCompare(b.code));
}

/** 读门类一层 facet（一次递归 CTE，命中 idx_level/idx_parent；不再查大类） */
export async function loadIndustryFacets(repo: IndustryNodeRepo): Promise<IndustryFacetOption[]> {
  return buildIndustrySections(await repo.listFacets("section"));
}

/**
 * 关键词 → 行业子树码集（行业词框的检索口径）。
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
