// 采购模块类型定义

export interface UnspscOption {
  id: number;
  code: string;
  title_zh?: string;
  title_en?: string;
  title?: string;
  name?: string;
}

export interface NoticeItem {
  id: number;
  notice_id?: string;
  reference?: string;
  title: string;
  notice_type?: string;
  agency?: string;
  organization?: string;
  country?: string;
  deadline?: string;
  estimated_value?: string;
  description?: string;
  source_url?: string;
  unspsc_codes?: Array<{ code?: string; name?: string; description?: string }>;
  core_locked?: boolean;
  unlock_type?: string;
  unlocked_at?: string;
  // 解锁后由 /api/notices/:id/detail 补充的拓展字段
  // Extended fields provided by /api/notices/:id/detail once unlocked
  url?: string;
  agency_full?: string;
  published_date?: string;
  difficulty?: string;
  registration_level?: string;
  contacts?: NoticeContact[];
  key_contacts?: NoticeContact[];
  documents?: NoticeAttachment[];
  procurement_files?: NoticeAttachment[];
  external_links?: NoticeAttachment[];
}

/** 公告联系人（解锁详情） */
export interface NoticeContact {
  name?: string;
  title?: string;
  role?: string;
  email?: string;
  phone?: string;
  organization?: string;
}

/** 公告文件 / 外部链接（解锁详情） */
export interface NoticeAttachment {
  name?: string;
  title?: string;
  label?: string;
  url?: string;
  link?: string;
  type?: string;
}

export interface NoticeResponse {
  items?: NoticeItem[];
  total?: number;
  pageSize?: number;
  page_size?: number;
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
