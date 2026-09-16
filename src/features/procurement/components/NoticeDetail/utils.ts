/**
 * NoticeDetail 工具函数和常量
 * @module features/procurement/components/NoticeDetail/utils
 */

/** Tab 定义 */
export interface DetailTab {
  key: string;
  labelKey: string;
  tier: "free" | "member" | "pro";
  tierLabelKey: string;
}

export const DETAIL_TABS: DetailTab[] = [
  { key: "summary", labelKey: "detail_tabSummary", tier: "free", tierLabelKey: "detail_free" },
  { key: "qualification", labelKey: "detail_tabQualification", tier: "member", tierLabelKey: "detail_member" },
  { key: "files", labelKey: "detail_tabOriginalFiles", tier: "member", tierLabelKey: "detail_member" },
  { key: "ai-score", labelKey: "detail_tabAiScore", tier: "pro", tierLabelKey: "detail_pro" },
  { key: "history", labelKey: "detail_tabHistory", tier: "pro", tierLabelKey: "detail_pro" },
  { key: "similar", labelKey: "detail_tabSimilar", tier: "free", tierLabelKey: "detail_free" },
];

export const TIER_BADGE_STYLE: Record<string, string> = {
  free: "bg-teal-50 text-teal-700 border-teal-200",
  member: "bg-amber-50 text-amber-700 border-amber-200",
  pro: "bg-purple-50 text-purple-700 border-purple-200",
};
