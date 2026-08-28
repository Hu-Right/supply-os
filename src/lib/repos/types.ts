/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 数据库行类型定义
 * Database Row Type Definitions
 *
 * @module repos/types
 * @description 全部 Repository 返回值的类型化接口，消除路由/服务层 (rows as any[]) 强转。
 *              Typed interfaces for all Repository return values, eliminating (rows as any[]) casts.
 */

export interface UserRow {
  id: number;
  user_key: string;
  email: string | null;
  phone: string | null;
  phone_verified: number;
  display_name: string | null;
  password_hash: string | null;
  password_hash_type: string;
  email_verified: number;
  membership_tier: string;
  account_status: string;
  supplier_id: number | null;
  supplier_link_status: string;
  referral_code: string | null;
  referral_employee_id: number | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface SubscriptionRow {
  id: number;
  user_id: number | null;
  user_key: string;
  plan_code: string;
  plan_name?: string;
  unlock_quota?: number;
  status: string;
  started_at: Date;
  expires_at: Date | null;
  created_at: Date;
}

export interface MembershipPlanRow {
  plan_code: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  duration_days: number | null;
  unlock_quota: number;
  free_quota: number;
  plan_type: string;
  is_active: number;
  sort_order: number;
}

export interface EntitlementRow {
  id: number;
  user_id: number | null;
  user_key: string;
  source_order_no: string | null;
  /** 升级来源权益 ID（仅升级产生的新权益有值） */
  upgraded_from_entitlement_id?: number | null;
  plan_code: string;
  quota_total: number;
  quota_used: number;
  quota_remaining: number;
  started_at: Date;
  expires_at: Date | null;
  status: string;
  /** 旧权益是否已被升级替代（0=正常, 1=已升级） */
  is_upgraded?: number;
}

export interface PaymentOrderRow {
  id: number;
  user_id: number | null;
  order_no: string;
  user_key: string;
  provider: string;
  plan_code: string;
  /** 订单类型：'new'（新购）/ 'upgrade'（升级补差） */
  order_type?: string;
  /** 升级订单关联的原订单号 */
  original_order_no?: string | null;
  notice_id: number | null;
  amount: number;
  currency: string;
  status: string;
  provider_trade_no: string | null;
  pay_url: string | null;
  qr_code_url: string | null;
  raw_request: string | null;
  raw_notify: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface SupplierRow {
  id: number;
  company_name: string;
  industry_id: number | null;
  industry: string | null;
  main_product: string | null;
  certification: string | null;
  enterprise_nature: string | null;
  contact_name: string | null;
  telephone: string | null;
  email: string | null;
}

export interface UnlockRow {
  id: number;
  user_id: number | null;
  user_key: string;
  opportunity_id: number | null;
  notice_id: number | null;
  unlock_type: string;
  price: number;
  unlocked_at: Date;
  unspsc_codes_snapshot: string | null;
}

export interface CountRow {
  total: number;
}

export interface EmployeeRow {
  id: number;
  name: string;
  employee_no: string | null;
  department: string | null;
  performance_group: string | null;
  is_active: number;
  created_at: Date;
  updated_at: Date | null;
}

export interface InvitationCodeRow {
  id: number;
  code: string;
  employee_id: number;
  max_uses: number | null;
  used_count: number;
  is_active: number;
  expires_at: Date | null;
  created_at: Date;
}
