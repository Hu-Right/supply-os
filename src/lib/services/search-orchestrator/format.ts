/**
 * 统一搜索编排器 — 结果格式化
 * Unified search orchestrator — result formatting
 *
 * @module server/services/search-orchestrator/format
 * @description 详情行 → 前端 NoticeItem 结构。对齐旧 formatSearchResult（搜索）
 *              与 mapResultItems（行业匹配）的字段口径，所有数据源行为一致。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

import { ensureAgencyDisplaySnapshot } from "../agency/resolve";
import { fromBackbonePathColumn } from "../commodity/backbone-path";

// 助手实体下沉 search-common/display-helpers（解 orchestrator⇄recommend 双向依赖），此处保留导出面
export { enrichAgencyI18n, ensureNoticePk } from "../search-common/display-helpers";
import { enrichAgencyI18n, ensureNoticePk } from "../search-common/display-helpers";

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
 * 机构展示的同步预热（详情/预览这类不走搜索主管道的单行出口专用，统一中文 2026-10-28）。
 * enrichAgencyI18n 读内存态：resolveAgencyDisplay 依赖 agency_aliases 快照，
 * 而该快照原先只在 refreshNoticeAgencies（下拉刷新）内部 ensure —— 详情请求不经过下拉，
 * 不显式预热就永远拿不到别名表精名，卡片中文 / 详情英文的漂移由此产生。
 * 预热带降级：失败只是少一层翻译，不能让详情 500。
 * [绝对准确 2026-10-29] 聚合桶退役后只剩别名快照一层，ensureAgencyI18nWarmup 并入本函数。
 */
export async function ensureAgencyDisplayWarmup(pool: Pool): Promise<void> {
  await ensureAgencyDisplaySnapshot(pool).catch(() => undefined);
}

/**
 * 机构 i18n（共享助手），输入行一律用**服务表原字段**。
 * [绝对准确 2026-10-29 口径] 买家字段只认**别名表登记名**（i18nFrom === "alias" 且 zh 含汉字）：
 * · 聚合桶（classify 类型桶 / 下拉缓存桶 / 国家级「XX各机构」）是「某一国一堆机构」的类别名，
 *   放在买家字段就是用桶名冒充买家名——用户明确要求绝对准确，全面退役；
 * · 模式合成名（"LAND REGISTRATION管理局"）是整串原文+末尾类型词的机械拼接，中英夹生，一并退役；
 * · 无登记名的买家显示真实原名（前端取值链 agencyI18n || buyerName 自然回退）——
 *   原名永远准确，宁缺毋假；中文精名靠 agency_aliases 批次持续补
 *   （runtime/agency-coverage.sql 月度巡检出清单）。
 * 筛选下拉（/api/notices/agencies）的聚合桶不受影响：那是过滤导航的本职语义。
 * ⚠ 下拉聚合缓存条目的键名仍是 `agency`（下拉 API 的形状），与公告行字段名无关；
 *   本函数已不再消费聚合缓存。
 */
/**
 * 格式化搜索结果 items（服务表原字段直出）。
 * 只补三件事：列表侧一律 core_locked=true（详情才由解锁记录定值）+ 机构 i18n + 来源字段裁剪。
 * 不做字段别名、不做布尔归一、不解析附件造计数——那些口径的唯一事实源在服务表行本身。
 * [来源平台 2026-10-28] source_url / platform_name 属解锁后可见信息（用户口径）：
 * 列表卡片不再展示来源，且必须从列表载荷剔除——锁定详情是「列表条目 + /preview 合成」，
 * 留着 source_url 锁定态也能外链原文；解锁后的来源展示由 /detail 独家下发。
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
  return enrichAgencyI18n(items, locale);
}


