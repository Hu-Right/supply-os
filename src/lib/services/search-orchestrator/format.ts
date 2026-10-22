/**
 * 统一搜索编排器 — 结果格式化
 * Unified search orchestrator — result formatting
 *
 * @module server/services/search-orchestrator/format
 * @description 详情行 → 前端 NoticeItem 结构。对齐旧 formatSearchResult（搜索）
 *              与 mapResultItems（行业匹配）的字段口径，所有数据源行为一致。
 */
import type { RowDataPacket } from "mysql2/promise";

import { getAgencyCacheData } from "../notice-search/agencies/index";
import { classifyAgencyType } from "../agency/index";
import { resolveAgencyDisplay } from "../agency/resolve";
import { fromBackbonePathColumn } from "../commodity/backbone-path";

/** 匹配分 → 档次标签（2 档分色；分数与 mode-resolver 绝对层级口径对齐：
 *  L4/L5 命中 → 5 → precise；L2/L3 命中 → 2 → relevant） */
export function matchScoreToTierLabel(score: number): string {
  if (score >= 5) return "precise";   // L5/L4 精确匹配 → 绿色徽章
  if (score >= 2) return "relevant";  // L3/L2 行业相关 → 蓝色徽章
  return "unmatched";
}

/** [阶段0 A2] 逐文档匹配分：公告自身 backbone_path（品目树节点码集）与用户画像各档比对，
 *  取最深命中档定分（与 mode-resolver 口径一致：L4/L5 → 5；L2/L3 → 2）。
 *  无命中返回 undefined（降级多表 JOIN 路径的行没有 backbone_path 列，不挂徽章）。
 *  2026-10-13 precise 退役：原先读 precise_backbone_path（candidates 人工审核码派生），
 *  该口径已随候选表删除 ⇒ 现统一按全量 backbone_path 计分，
 *  行业匹配徽章语义待「行业树↔品目树」桥接重建。列值解析只走 fromBackbonePathColumn。 */
function perDocMatchScore(
  row: RowDataPacket,
  profileNodes: Array<{ level: number; node: string }>,
): number | undefined {
  const docNodes = new Set(fromBackbonePathColumn(row.backbone_path));
  if (docNodes.size === 0) return undefined;
  for (let level = 5; level >= 2; level -= 1) {
    const entry = profileNodes.find((e) => e.level === level);
    if (entry && docNodes.has(entry.node)) return level >= 4 ? 5 : 2;
  }
  return undefined;
}

/**
 * 机构 i18n 三级回退（共享助手），输入行一律用**服务表原字段**：
 * 1. 缓存精确匹配：buyer_name 大写 → agencyI18nMap（来自下拉 API 缓存）
 * 2. 聚合键回退：buyer_group（classifyAgencyType 聚合键，如 "MUNICIPIO_BR"）
 * 3. 直接计算回退：经 resolveAgencyDisplay 走「别名表→正则」单一入口（与下拉 query 同源）；
 *    无 i18n 时再经 classifyAgencyType 计算聚合 i18n（国家取 country_code）。确保卡片与下拉框展示完全一致。
 *    全程纯内存正则匹配，无 DB/缓存依赖，开销可忽略。
 *
 * 2026-10-12 从 formatItems 抽出：推荐管道（recommend/recall）此前不做机构
 * 翻译，占位平台代码（mercadopublico_cl 等）在"智能推荐"列表原样露出。
 * ⚠ 下拉缓存条目自身的键名仍是 `agency`（那是下拉 API 的形状），与公告行字段名无关。
 */
export function enrichAgencyI18n(
  items: Array<Record<string, unknown>>,
  locale: string,
): Array<Record<string, unknown>> {
  // 机构国际化映射（键统一大写，与 query.ts 缓存构建侧 mergeKey/typeKey 口径对齐）
  const agencyCache = getAgencyCacheData();
  const agencyI18nMap = new Map<string, Record<string, string>>();
  if (agencyCache) {
    for (const item of agencyCache) {
      if (item.i18n) agencyI18nMap.set(String(item.agency || "").toUpperCase(), item.i18n);
    }
  }
  for (const item of items) {
    const agencyUpper = String(item.buyer_name || "").toUpperCase();
    let i18n = agencyI18nMap.get(agencyUpper)
      || (item.buyer_group ? agencyI18nMap.get(String(item.buyer_group)) : undefined);
    if (!i18n && item.buyer_name) {
      // 与下拉管线同一入口：表→正则 经 resolveAgencyDisplay（不在此重复写两套）
      const disp = resolveAgencyDisplay(String(item.buyer_name));
      if (disp.i18n) {
        i18n = disp.i18n;
      } else {
        // 无 i18n → 聚合分类计算回退（用解析后的 canonical）
        const typeInfo = classifyAgencyType(disp.canonical, item.country_code ? String(item.country_code) : undefined);
        if (typeInfo?.i18n) i18n = typeInfo.i18n;
      }
    }
    item.agency_i18n = i18n?.[locale] || undefined;
  }
  return items;
}

/**
 * 格式化搜索结果 items（服务表原字段直出）。
 * 只补两件事：列表侧一律 core_locked=true（详情才由解锁记录定值）+ 机构 i18n。
 * 不做字段别名、不做布尔归一、不解析附件造计数——那些口径的唯一事实源在服务表行本身。
 * @param rows 详情行（fetchDetailsByIds 输出）
 * @param locale 界面语言（agency_i18n 取值）
 * @param profileNodes 可选：用户行业画像的节点码序列（prefs 模式；逐文档计算匹配档次）
 */
export function formatItems(
  rows: RowDataPacket[],
  locale: string,
  profileNodes?: Array<{ level: number; node: string }>,
): Array<Record<string, unknown>> {
  const items = rows.map((row) => {
    const item: Record<string, unknown> = {
      ...row,
      core_locked: true,
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
  return enrichAgencyI18n(items, locale);
}


