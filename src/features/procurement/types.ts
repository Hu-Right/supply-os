// 采购模块类型定义

// 采购公告相关类型统一以全局 `@/types` 为单一事实源，此处 re-export 供 feature 内部复用。
// Notice-related types share the single source of truth in `@/types`; re-exported here for feature-local use.
export type { NoticeItem, NoticeListItem, NoticeDetailItem, NoticeDetailFields, NoticeContact, NoticeAttachment, NoticeResponse } from "@/types";
// 会员类型同样以 `@/types` 为单一事实源
// 会员侧消费的是对外视图（红线②），不是 repo 行类型
export type { PlanView, MembershipStatusView } from "@/types";

/**
 * 公告标题/说明的按需 AI 译文 On-demand AI translation of a notice
 */
export interface NoticeTranslation {
  lang: string;
  title: string | null;
  description: string | null;
  cached: boolean;
}
