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
import { getAgencyCacheData } from "../notice-search/agencies/index";

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
  // 机构国际化映射
  const agencyCache = getAgencyCacheData();
  const agencyI18nMap = new Map<string, Record<string, string>>();
  if (agencyCache) {
    for (const item of agencyCache) {
      if (item.i18n) agencyI18nMap.set(item.agency, item.i18n);
    }
  }

  return rows.map((row) => {
    // 机构 i18n 查找：先用 agency_std（别名映射后的规范名）精确匹配；
    // 未命中时用 agency_group（classifyAgencyType 聚合键，如 "MUNICIPIO_BR"）回退查找。
    // 原因：聚合机构在缓存中以 typeKey 为键（如 "MUNICIPIO_BR" → "巴西各市"），
    // 而 row.agency 是 agency_std（如 "MUNICIPIO DE MORAUJO"），两者键空间不同。
    // 回退路径（多表 JOIN）无 agency_group 列，row.agency_group 为 undefined，安全跳过。
    const i18n = agencyI18nMap.get(row.agency)
      || (row.agency_group ? agencyI18nMap.get(row.agency_group) : undefined);
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
