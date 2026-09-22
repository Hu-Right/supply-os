/**
 * NoticeDetail 工具函数和常量
 * @module features/procurement/components/NoticeDetail/utils
 *
 * V2 权益（2026-09-21）：tier 为各模块最低可用档位的展示标注（与后端
 * lib/services/benefit-matrix.ts 的 FEATURE_REQUIRED_RANK 一致）：
 * summary/similar 免费；qualification/files 会员（解锁语义，计额度）；
 * history 标准版（999）；ai-score 专业版（1299）。
 */

/** Tab 定义 */
export interface DetailTab {
  key: string;
  labelKey: string;
  tier: "free" | "member" | "std" | "pro";
  tierLabelKey: string;
}

export const DETAIL_TABS: DetailTab[] = [
  { key: "summary", labelKey: "detail_tabSummary", tier: "free", tierLabelKey: "detail_free" },
  { key: "qualification", labelKey: "detail_tabQualification", tier: "member", tierLabelKey: "detail_member" },
  { key: "files", labelKey: "detail_tabOriginalFiles", tier: "member", tierLabelKey: "detail_member" },
  { key: "ai-score", labelKey: "detail_tabAiScore", tier: "pro", tierLabelKey: "detail_pro" },
  { key: "history", labelKey: "detail_tabHistory", tier: "std", tierLabelKey: "detail_std" },
  { key: "similar", labelKey: "detail_tabSimilar", tier: "free", tierLabelKey: "detail_free" },
];

export const TIER_BADGE_STYLE: Record<string, string> = {
  free: "bg-teal-50 text-teal-700 border-teal-200",
  member: "bg-amber-50 text-amber-700 border-amber-200",
  std: "bg-indigo-50 text-indigo-700 border-indigo-200",
  pro: "bg-purple-50 text-purple-700 border-purple-200",
};

/**
 * ARIA Tabs id 单一事实源（spec 2026-09-21）：Tab 条与内容区共用，
 * 保证 aria-controls / aria-labelledby 联动不断链。
 */
export const tabTriggerId = (key: string) => `detail-tab-${key}`;
export const tabPanelId = (key: string) => `detail-tabpanel-${key}`;
