/**
 * 统一搜索编排器 — 结果格式化
 * Unified search orchestrator — result formatting
 *
 * @module server/services/search-orchestrator/format
 * @description 详情行 → 前端 NoticeItem 结构。对齐旧 formatSearchResult（搜索）
 *              与 mapResultItems（行业匹配）的字段口径，所有数据源行为一致。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

import { fromBackbonePathColumn } from "../commodity/backbone-path";

// 助手实体下沉 search-common/display-helpers（解 orchestrator⇄recommend 双向依赖），此处保留导出面
export { ensureNoticePk } from "../search-common/display-helpers";
import { ensureNoticePk } from "../search-common/display-helpers";

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
 * 格式化搜索结果 items（服务表原字段直出）。
 * 只补三件事：列表侧一律 core_locked=true（详情才由解锁记录定值）+ 匹配档次 + 来源字段裁剪。
 * [2026-10-31 机构 i18n 链退役] agency_i18n 不再计算/下发：前端取值链已全面走
 * buyerNameCn || buyerName（写时快照列），读时别名解析零消费方，别名表精名继续靠
 * 写侧 notice-core 归一沉淀（runtime/agency-coverage.sql 月度巡检照旧）。
 * [来源平台 2026-10-28] source_url / platform_name 属解锁后可见信息（用户口径）：
 * 列表卡片不再展示来源，且必须从列表载荷剔除——锁定详情是「列表条目 + /preview 合成」，
 * 留着 source_url 锁定态也能外链原文；解锁后的来源展示由 /detail 独家下发。
 * @param rows 详情行（fetchDetailsByIds 输出）
 * @param profileNodes 可选：用户行业画像的节点码序列（prefs 模式；逐文档计算匹配档次）
 */
export function formatItems(
  rows: RowDataPacket[],
  profileNodes?: Array<{ level: number; node: string }>,
): Array<Record<string, unknown>> {
  const items = rows.map((row) => {
    const item: Record<string, unknown> = {
      ...row,
      core_locked: true,
    };
    delete item.source_url;
    delete item.platform_name;

    // prefs 模式：逐文档计算匹配分与档次标签（[阶段0 A2] 替代旧版整页统一赋分：
    // 放宽到 L2 后，实际命中 L4/L5 精准码的条目仍应显示 precise 绿标）
    if (profileNodes) {
      const score = perDocMatchScore(row, profileNodes);
      if (score !== undefined) {
        item.match_score = score;
        item.match_tier = matchScoreToTierLabel(score);
      }
    }
    return ensureNoticePk(item);
  });
  return items;
}


