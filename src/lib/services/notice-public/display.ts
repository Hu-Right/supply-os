/**
 * 公开展示取值（语言决策唯一入口）
 *
 * @module lib/services/notice-public/display
 *
 * @description 同一条公告在库里有两个标题/两份正文：
 *                - `title` / `description`：源站原文（英/西/葡/拉脱维亚语…）
 *                - `title_cn` / `description_cn`：中文译文（稀疏，仅部分公告有）
 *
 *              「展示哪一份」过去散落在三处：登录详情用 titleCn、公开页用 title、
 *              列表用搜索文档的 title，规则各不相同。本模块把这条规则收敛成一处：
 *
 *                **中文优先，缺失或不可用时回退原文。**
 *
 *              付费边界不在这里决定：摘要固定截 300 字（公开面），全文仍由
 *              登录 + 会员权益控制（见 notice-access）。
 */

export interface DisplaySourceRow {
  title?: string | null;
  title_cn?: string | null;
  description?: string | null;
  description_cn?: string | null;
  notice_pk?: number | string | null;
}

/** 译文最短有效长度：过短（"见附件"）或与原文相同的译文视为不可用 */
const MIN_TRANSLATION_CHARS = 4;
/** `<title>` 建议长度（中文字符），超过会被 SERP 截断 */
const META_TITLE_MAX = 60;

/**
 * 展示标题：中文译文优先。
 *
 * 三个回退条件（避免把半截机翻顶到 H1）：
 * 1. 译文为空；
 * 2. 译文过短（< 4 字）；
 * 3. 译文与原文完全相同（说明没有真正翻译）。
 */
export function pickDisplayTitle(row: DisplaySourceRow): string {
  const cn = (row.title_cn ?? "").trim();
  const raw = (row.title ?? "").trim();
  const usable = cn.length >= MIN_TRANSLATION_CHARS && cn !== raw;
  const title = usable ? cn : raw;
  return title || `#${row.notice_pk ?? ""}`;
}

/**
 * 公开摘要：中文优先，固定截断（付费边界）。
 * 只做空白归一与截断，不做脱敏（2026-11-25 产品决策：不做内容脱敏）。
 */
export function pickDisplaySummary(row: DisplaySourceRow, limit = 300): string {
  const src = (row.description_cn ?? "").trim() || (row.description ?? "").trim();
  if (!src) return "";
  return src.replace(/\s+/g, " ").slice(0, limit);
}

/** 给 `<title>` 用的短标题：保留完整 H1，只截 meta 标题 */
export function pickMetaTitle(title: string, max = META_TITLE_MAX): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}
