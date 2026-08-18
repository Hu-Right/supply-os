/**
 * 统一搜索编排器 — 结果格式化
 * Unified search orchestrator — result formatting
 *
 * @module server/services/search-orchestrator/format
 * @description 详情行 → 前端 NoticeItem 结构。对齐旧 formatSearchResult（搜索）
 *              与 mapResultItems（行业匹配）的字段口径，所有数据源行为一致。
 */
import type { RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import { getAgencyCacheData } from "../notice-search/agencies";

/** 匹配分 → 档次标签（2 档分色；分数由 mode-resolver 按绝对层级给出：
 *  L4/L5 命中 → 5 → precise；L2/L3 命中 → 2 → relevant） */
export function matchScoreToTierLabel(score: number): string {
  if (score >= 5) return "precise";   // L5/L4 精确匹配 → 绿色徽章
  if (score >= 2) return "relevant";  // L3/L2 行业相关 → 蓝色徽章
  return "unmatched";
}

/**
 * 格式化搜索结果 items。
 * @param rows 详情行（fetchDetailsByIds 输出）
 * @param locale 界面语言（agency_i18n 取值）
 * @param matchScores 可选：id → match_score 映射（prefs 模式渐进放宽层级分）
 */
export function formatItems(
  rows: RowDataPacket[],
  locale: string,
  matchScores?: Map<number, number>,
): Array<Record<string, unknown>> {
  // 机构国际化映射
  const agencyCache = getAgencyCacheData();
  const agencyI18nMap = new Map<string, Record<string, string>>();
  if (agencyCache) {
    for (const item of agencyCache) {
      if (item.i18n) agencyI18nMap.set(item.agency, item.i18n);
    }
  }

  return rows.map((row) => {
    const id = Number(row.id);
    const i18n = agencyI18nMap.get(row.agency);
    // breakdown_file_count：宽表直取；多表 JOIN 回退路径解析 JSON
    const breakdownCount = row.breakdown_file_count !== undefined
      ? (Number(row.breakdown_file_count) || undefined)
      : (normalizeDocumentRows(row.documents, row.procurement_files).length || undefined);

    const item: Record<string, unknown> = {
      ...row,
      agency_i18n: i18n?.[locale] || undefined,
      organization: null,
      source_url: null,
      unspsc_codes: [],
      core_locked: true,
      is_featured: row.is_featured ? true : false,
      breakdown_file_count: breakdownCount,
    };

    // prefs 模式：附加匹配分与档次标签（前端展示推荐理由）
    if (matchScores && matchScores.has(id)) {
      const score = matchScores.get(id)!;
      item.match_score = score;
      item.match_tier = matchScoreToTierLabel(score);
    }
    return item;
  });
}
