/**
 * 统一搜索编排器 — 结果格式化
 * Unified search orchestrator — result formatting
 *
 * @module server/services/search-orchestrator/format
 * @description 详情行 → 前端 NoticeItem 结构。对齐旧 formatSearchResult（搜索）
 *              与 mapResultItems（行业匹配）的字段口径，所有数据源行为一致。
 */
import type { RowDataPacket } from "mysql2/promise";

// 助手实体下沉 search-common/display-helpers（解 orchestrator⇄recommend 双向依赖），此处保留导出面
export { ensureNoticePk } from "../search-common/display-helpers";
import { ensureNoticePk } from "../search-common/display-helpers";

/**
 * 格式化搜索结果 items（服务表原字段直出）。
 * 只补两件事：列表侧一律 core_locked=true（详情才由解锁记录定值）+ 来源字段裁剪。
 * [2026-10-31 机构 i18n 链退役] agency_i18n 不再计算/下发：前端取值链已全面走
 * buyerNameCn || buyerName（写时快照列），读时别名解析零消费方，别名表精名继续靠
 * 写侧 notice-core 归一沉淀（runtime/agency-coverage.sql 月度巡检照旧）。
 * [来源平台 2026-10-28] source_url / platform_name 属解锁后可见信息（用户口径）：
 * 列表卡片不再展示来源，且必须从列表载荷剔除——锁定详情是「列表条目 + /preview 合成」，
 * 留着 source_url 锁定态也能外链原文；解锁后的来源展示由 /detail 独家下发。
 * [2026-11-12] 逐文档匹配档次（match_score / match_tier）随「主营行业」prefs 模式退役删除：
 * 它唯一的输入是用户行业画像，画像下线后无人能产生该输入。
 * @param rows 详情行（fetchDetailsByIds 输出）
 */
export function formatItems(rows: RowDataPacket[]): Array<Record<string, unknown>> {
  const items = rows.map((row) => {
    const item: Record<string, unknown> = {
      ...row,
      core_locked: true,
    };
    delete item.source_url;
    delete item.platform_name;
    return ensureNoticePk(item);
  });
  return items;
}


