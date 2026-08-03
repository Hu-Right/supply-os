// 采购模块类型定义

// 采购公告相关类型统一以全局 `@/types` 为单一事实源，此处 re-export 供 feature 内部复用。
// Notice-related types share the single source of truth in `@/types`; re-exported here for feature-local use.
export type { NoticeItem, NoticeContact, NoticeAttachment, NoticeResponse } from "@/types";
// 会员类型同样以 `@/types` 为单一事实源
export type { MembershipPlan, MembershipStatus } from "@/types";

export interface UnspscOption {
  id: number;
  code: string;
  title_zh?: string;
  title_en?: string;
  /** 界面语言译文（fr/ru/es/ar 请求时后端 JOIN 缓存附带；缺译为 null） */
  title_i18n?: string | null;
  title?: string;
  name?: string;
}

/**
 * 进入公采页的初始化状态机（本地差异 #5）：
 * loading = 登录态判定中；prefs = 按账号默认行业筛选；recommended = 按行为兴趣推荐；default = 现状全量
 */
export type PrefsMode = "loading" | "prefs" | "recommended" | "default";

/** 公告标题/说明的按需 AI 译文 On-demand AI translation of a notice */
export interface NoticeTranslation {
  lang: string;
  title: string | null;
  description: string | null;
  cached: boolean;
}
