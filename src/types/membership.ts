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
