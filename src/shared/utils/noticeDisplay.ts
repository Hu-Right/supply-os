/**
 * 公告展示层通用工具 — 跨 feature 共享的显示逻辑
 * Notice Display Utilities — Shared display logic across features
 *
 * @module shared/utils/noticeDisplay
 * @description 从 features/home/ContentColumns 与 features/procurement/NoticeCard
 *              提取的通用展示逻辑：标题回退链、预算格式化、截止日期标签。
 *              确保首页卡片与列表页的显示口径完全一致。
 */

/** 公告宽表字段子集 — 展示层所需的最小字段口径 */
export interface NoticeDisplayFields {
  title: string;
  title_i18n?: string;
  title_en?: string;
  agency?: string;
  agency_i18n?: string;
  country: string;
  estimated_value: string;
  deadline_sec: number | null;
  notice_type?: string;
}

/**
 * 标题显示回退链：i18n 本地化标题 → 英文标题 → 原始标题。
 * 与 procurement/NoticeCard 保持一致。
 */
export function displayNoticeTitle(n: NoticeDisplayFields): string {
  return n.title_i18n || n.title_en || n.title;
}

/**
 * 采购机构显示回退链：i18n 机构名 → 原始机构名 → 空串。
 */
export function displayNoticeAgency(n: NoticeDisplayFields): string {
  return n.agency_i18n || n.agency || "";
}

/**
 * 预算格式化：有值 → "USD N,NNN"，空/0 → "预算详谈"。
 * （原 ContentColumns 内联逻辑）
 */
export function displayNoticeBudget(estimatedValue: string | null | undefined): string {
  if (!estimatedValue || estimatedValue === "0.00") return "预算详谈";
  return `USD ${Number(estimatedValue).toLocaleString()}`;
}

/**
 * 截止日期标签：
 * - 无截止（deadline_sec = 0 / 字段缺失）→ "长期有效"
 *   （与 utils/notice-expired 的 ACTIVE_NOTICE_WHERE 单一事实源对齐：
 *     deadline_sec = 0 表示无截止日期、永不过期，不可误标为"已截止"）
 * - 已过期 → "已截止"
 * - 超 365 天（框架协议等）→ 显示具体日期（规划 §8 数据质量）
 * - 其他 → "截止 N 天"
 *
 * （原 ContentColumns 内联逻辑，与 procurement/utils/formatDeadlineZh 互补）
 */
export function displayDeadlineLabel(deadlineSec: number | null | undefined): string {
  if (deadlineSec == null || deadlineSec === 0) return "长期有效";
  const nowMs = Date.now();
  const left = Math.ceil((new Date(deadlineSec * 1000).getTime() - nowMs) / (1000 * 60 * 60 * 24));
  if (left <= 0) return "已截止";
  if (left > 365) {
    const d = new Date(deadlineSec * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 截止`;
  }
  return `截止 ${left} 天`;
}
