/**
 * 统一搜索编排器 — 结果格式化
 * Unified search orchestrator — result formatting
 *
 * @module server/services/search-orchestrator/format
 * @description 详情行 → 前端 NoticeItem 结构。对齐旧 formatSearchResult（搜索）
 *              与 mapResultItems（行业匹配）的字段口径，所有数据源行为一致。
 */
import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import { getAgencyCacheData } from "../notice-search/agencies/index";
import { classifyAgencyType } from "../agency/index";
import { translateByPattern } from "../../../lib/data/agency-i18n/translate";

/** 匹配分 → 档次标签（2 档分色；分数与 mode-resolver 绝对层级口径对齐：
 *  L4/L5 命中 → 5 → precise；L2/L3 命中 → 2 → relevant） */
export function matchScoreToTierLabel(score: number): string {
  if (score >= 5) return "precise";   // L5/L4 精确匹配 → 绿色徽章
  if (score >= 2) return "relevant";  // L3/L2 行业相关 → 蓝色徽章
  return "unmatched";
}

/** [阶段0 A2] 逐文档匹配分：公告自身 precise_level{N}（逗号串）与用户画像各级 ID 比对，
 *  取最深命中层级定分（与 mode-resolver 口径一致：L4/L5 → 5；L2/L3 → 2）。
 *  无命中返回 undefined（降级多表 JOIN 路径的行无 precise 列，不挂徽章） */
function perDocMatchScore(
  row: RowDataPacket,
  profileLevels: Array<{ level: number; id: string }>,
): number | undefined {
  for (let level = 5; level >= 2; level -= 1) {
    const profile = profileLevels.find((entry) => entry.level === level);
    if (!profile) continue;
    const docCodes = String(row[`precise_level${level}`] || "").split(",").filter(Boolean);
    if (docCodes.includes(String(profile.id))) return level >= 4 ? 5 : 2;
  }
  return undefined;
}

/**
 * 格式化搜索结果 items。
 * @param rows 详情行（fetchDetailsByIds 输出）
 * @param locale 界面语言（agency_i18n 取值）
 * @param profileLevels 可选：用户行业画像层级序列（prefs 模式；逐文档计算匹配档次）
 */
export function formatItems(
  rows: RowDataPacket[],
  locale: string,
  profileLevels?: Array<{ level: number; id: string }>,
): Array<Record<string, unknown>> {
  // 机构国际化映射（键统一大写，与 query.ts 缓存构建侧 mergeKey/typeKey 口径对齐）
  const agencyCache = getAgencyCacheData();
  const agencyI18nMap = new Map<string, Record<string, string>>();
  if (agencyCache) {
    for (const item of agencyCache) {
      if (item.i18n) agencyI18nMap.set(String(item.agency || "").toUpperCase(), item.i18n);
    }
  }

  return rows.map((row) => {
    // 机构 i18n 查找（三级回退）：
    // 1. 缓存精确匹配：agency_std 大写 → agencyI18nMap（来自下拉 API 缓存）
    // 2. 聚合键回退：agency_group（classifyAgencyType 聚合键，如 "MUNICIPIO_BR"）
    // 3. 直接计算回退：先经 translateByPattern 规范化机构名（与下拉管线 stage 3.5
    //    同源），再经 classifyAgencyType 计算 typeKey + i18n（与下拉管线 stage 3.6
    //    同源）。两步对齐确保卡片与下拉框展示完全一致的中文翻译名。
    //    全程纯内存正则匹配，无 DB/缓存依赖，开销可忽略。
    const agencyUpper = String(row.agency || "").toUpperCase();
    let i18n = agencyI18nMap.get(agencyUpper)
      || (row.agency_group ? agencyI18nMap.get(row.agency_group) : undefined);
    if (!i18n && row.agency) {
      // 先规范化：与下拉管线 stage 3.5 同源（如去掉 "ESTADO DE" 等前缀）
      const patternResult = translateByPattern(String(row.agency));
      const canonicalName = patternResult?.canonical || String(row.agency);
      // 再分类：与下拉管线 stage 3.6 同源（用规范化后的名字匹配 TYPE_PATTERNS）
      const typeInfo = classifyAgencyType(canonicalName, row.country || undefined);
      if (typeInfo?.i18n) i18n = typeInfo.i18n;
    }
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

    // prefs 模式：逐文档计算匹配分与档次标签（[阶段0 A2] 替代旧版整页统一赋分：
    // 放宽到 L2 后，实际命中 L4/L5 精准码的条目仍应显示 precise 绿标）
    if (profileLevels) {
      const score = perDocMatchScore(row, profileLevels);
      if (score !== undefined) {
        item.match_score = score;
        item.match_tier = matchScoreToTierLabel(score);
      }
    }
    return item;
  });
}
