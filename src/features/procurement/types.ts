// 采购模块类型定义

// 采购公告相关类型统一以全局 `@/types` 为单一事实源，此处 re-export 供 feature 内部复用。
// Notice-related types share the single source of truth in `@/types`; re-exported here for feature-local use.
export type { NoticeItem, NoticeContact, NoticeAttachment, NoticeResponse } from "@/types";

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

export interface MembershipPlan {
  plan_code: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  duration_days?: number | null;
  unlock_quota: number;
  free_quota: number;
  plan_type: string;
}

export interface MembershipStatus {
  membership_tier: string;
  free_quota: number;
  free_used: number;
  free_remaining: number;
  paid_unlocks: number;
  paid_quota_total?: number;
  paid_quota_used?: number;
  paid_quota_remaining?: number;
  active_subscriptions?: Array<{
    plan_code: string;
    status: string;
    expires_at?: string | null;
  }>;
  entitlements?: Array<{
    id: number;
    plan_code: string;
    quota_total: number;
    quota_used: number;
    quota_remaining: number;
    expires_at?: string | null;
  }>;
}

export interface PaymentOrder {
  order_no: string;
  provider: "alipay" | "wechat" | "mock";
  plan_code: string;
  amount: number;
  currency?: string;
  status: string;
  payment_mode?: "configured" | "mock";
  pay_url?: string;
  qr_code_url?: string;
}

/** 公告标题/说明的按需 AI 译文 On-demand AI translation of a notice */
export interface NoticeTranslation {
  lang: string;
  title: string | null;
  description: string | null;
  cached: boolean;
}
