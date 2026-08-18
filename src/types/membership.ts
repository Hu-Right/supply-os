/**
 * 会员体系类型
 * Membership Types
 *
 * @module types/membership
 * @description 会员商品套餐（可购买的会员方案）与会员状态（配额/订阅/到期）
 *              Membership product plans (purchasable packages) and membership status (quota/subscription/expiry)
 */

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
  /** 当前最优周期性权益的套餐 code（升级判断依据） */
  current_plan_code?: string | null;
  /** 当前最优周期性权益的套餐名称（VIP 等级标签提取依据） */
  current_plan_name?: string | null;
  /** 当前套餐等级标签（个人版/基础版/旗舰版/至尊版，兜底 VIP） */
  current_plan_tier_label?: string | null;
  /** 当前套餐价格（升级差价计算依据） */
  current_plan_price?: number | null;
  active_subscriptions?: Array<{ plan_code: string; plan_name?: string; status: string; expires_at?: string | null }>;
  entitlements?: Array<{
    id: number;
    plan_code: string;
    quota_total: number;
    quota_used: number;
    quota_remaining: number;
    expires_at?: string | null;
  }>;
}

/** 升级预览信息（GET /api/membership/upgrade/preview 响应） */
export interface UpgradePreview {
  /** 是否允许升级 */
  can_upgrade: boolean;
  /** 不允许升级的原因（can_upgrade=false 时有值） */
  reason: string | null;
  current_plan: {
    plan_code: string;
    name: string;
    price: number;
    unlock_quota: number;
    started_at?: string | null;
    expires_at?: string | null;
  } | null;
  target_plan: {
    plan_code: string;
    name: string;
    price: number;
    unlock_quota: number;
  } | null;
  /** 当前权益已使用次数 */
  quota_used: number;
  /** 需补交差价 */
  price_difference: number;
  /** 升级后剩余可用次数（target_quota - quota_used） */
  remaining_after_upgrade: number;
  /** 升级后有效期不变 */
  expires_at_unchanged: boolean;
}
