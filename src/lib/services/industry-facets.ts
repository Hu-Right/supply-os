/**
 * 行业检索口径 — 级联下拉的完整树读取 与 行业关键词解析
 * Industry Facets & Keyword Resolution
 *
 * @module lib/services/industry-facets
 * @description 本模块围绕权威行业树（crm_industry_nodes）提供两类口子：
 *                - 级联下拉（门类→大类→中类→小类）：按层级 / 按父码读**完整分类树**，
 *                  零挂靠节点同样下发、同样可选——选中无供应商的节点就正常返回「无结果」，
 *                  不再按门户可见供应商数过滤（2026-10-12 由「只显示有供应商的 facet」改为此口径）；
 *                - 关键词（行业词检索）：先把词解析成命中的行业节点集，再交上层按子树筛
 *                  （官方名优先、释义兜底，避免细分词被枚举型释义冲到粗层）。
 *
 *              两种口径都只认树，不退回 supplier.industry 自由文本 LIKE：那个字段与自造值同寿命
 *              （2026-10-09 实测全库 20 种写法含「其他 / Other」），把它引回检索路径只会污染结果。
 *              双语名全空的节点不进下拉（不把 UGT-I-xxxx 透到界面）——那是数据缺口，不是要展示的分类。
 */
import { minimalSubtreePrefixes } from "./industry-code";
import type { IndustryNodeRow, IndustryNodeRepo } from "../repos/industry-node.repo";

/**
 * 级联下拉的一条选项（与商机页品目级联同形状：key 就是可直接下筛的节点码）。
 * 门类一层与第 2~4 级共用此形状；不带供应商计数——完整分类树，零挂靠节点同样可选。
 */
export interface IndustryTreeOption {
  /** 筛选键 = 行业节点码（UGT-I-…），可直接喂 /api/suppliers?industry_code=（子树前缀筛） */
  key: string;
  nameZh: string;
  nameEn: string;
}

/** 节点行 → 级联选项；双语名全空则丢弃（宁可不给选项，也不把 UGT-I-xxxx 透到界面） */
function toTreeOption(row: IndustryNodeRow): IndustryTreeOption | null {
  const nameZh = String(row.name_zh ?? "").trim();
  const nameEn = String(row.name_en ?? "").trim();
  if (!nameZh && !nameEn) return null;
  return { key: row.code, nameZh: nameZh || nameEn, nameEn: nameEn || nameZh };
}

function toTreeOptions(rows: readonly IndustryNodeRow[]): IndustryTreeOption[] {
  const out: IndustryTreeOption[] = [];
  for (const row of rows) {
    const opt = toTreeOption(row);
    if (opt) out.push(opt);
  }
  return out;
}

/** 读门类一层（完整树，按码序）：级联下拉第一级选项 */
export async function loadIndustrySections(repo: IndustryNodeRepo): Promise<IndustryTreeOption[]> {
  return toTreeOptions(await repo.listNodesByLevel("section"));
}

/** 级联下一层：读某个父码的全部直接子节点（完整树，按码序，不按供应商数过滤） */
export async function loadIndustryChildren(
  repo: IndustryNodeRepo,
  parentCode: string,
): Promise<IndustryTreeOption[]> {
  return toTreeOptions(await repo.listChildNodes(parentCode));
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
