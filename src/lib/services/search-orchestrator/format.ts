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
import { classifyAgencyType } from "../agency/index";
import { translateByPattern } from "../../data/agency-i18n/translate";
import { fromBackbonePathColumn } from "../commodity/backbone-path";

/** 匹配分 → 档次标签（2 档分色；分数与 mode-resolver 绝对层级口径对齐：
 *  L4/L5 命中 → 5 → precise；L2/L3 命中 → 2 → relevant） */
export function matchScoreToTierLabel(score: number): string {
  if (score >= 5) return "precise";   // L5/L4 精确匹配 → 绿色徽章
  if (score >= 2) return "relevant";  // L3/L2 行业相关 → 蓝色徽章
  return "unmatched";
}

/** [阶段0 A2] 逐文档匹配分：公告自身 precise_backbone_path（品目树节点码集）与用户画像各档比对，
 *  取最深命中档定分（与 mode-resolver 口径一致：L4/L5 → 5；L2/L3 → 2）。
 *  无命中返回 undefined（降级多表 JOIN 路径的行没有 precise 列，不挂徽章）。
 *  2026-10-11 backbone 化：原先读 `precise_level{N}` 五列再比旧字典行 id，
 *  现在比的是节点码：公告的 precise 链里含某一档的节点码即命中该档
 *  （列值解析只走 fromBackbonePathColumn，全库一份形制口径）。 */
function perDocMatchScore(
  row: RowDataPacket,
  profileNodes: Array<{ level: number; node: string }>,
): number | undefined {
  const docNodes = new Set(fromBackbonePathColumn(row.precise_backbone_path));
  if (docNodes.size === 0) return undefined;
  for (let level = 5; level >= 2; level -= 1) {
    const entry = profileNodes.find((e) => e.level === level);
    if (entry && docNodes.has(entry.node)) return level >= 4 ? 5 : 2;
  }
  return undefined;
}

/**
 * 格式化搜索结果 items。
 * @param rows 详情行（fetchDetailsByIds 输出）
 * @param locale 界面语言（agency_i18n 取值）
 * @param profileNodes 可选：用户行业画像的节点码序列（prefs 模式；逐文档计算匹配档次）
 */
export function formatItems(
  rows: RowDataPacket[],
  locale: string,
  profileNodes?: Array<{ level: number; node: string }>,
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
      // [修复 2026-08-29] 优先使用 translateByPattern 自身的 i18n（精确缩写匹配如
      // ISDB_GLOBAL → "伊斯兰开发银行"）。此前仅取 classifyAgencyType 结果，但
      // classifyAgencyType 对已知缩写返回 null（不聚合），导致翻译被丢弃。
      if (patternResult?.i18n) {
        i18n = patternResult.i18n;
      } else {
        const canonicalName = patternResult?.canonical || String(row.agency);
        // 再分类：与下拉管线 stage 3.6 同源（用规范化后的名字匹配 TYPE_PATTERNS）
        const typeInfo = classifyAgencyType(canonicalName, row.country || undefined);
        if (typeInfo?.i18n) i18n = typeInfo.i18n;
      }
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
    if (profileNodes) {
      const score = perDocMatchScore(row, profileNodes);
      if (score !== undefined) {
        item.match_score = score;
        item.match_tier = matchScoreToTierLabel(score);
      }
    }
    return item;
  });
}
