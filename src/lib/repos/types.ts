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
  email: string | null;
  phone: string | null;
  phone_verified: number;
  display_name: string | null;
  /** 对外展示名（昵称）；display_name 存真实姓名，不进入 API 响应 */
  nickname: string | null;
  password_hash: string | null;
  password_hash_type: string;
  email_verified: number;
  account_status: string;
  user_type: string; // 'personal' | 'enterprise'
  supplier_id: number | null;
  supplier_link_status: string;
  referral_code: string | null;
  referral_employee_id: number | null;
  created_at: Date;
  updated_at: Date | null;
  last_login_at: Date | null;
}

export interface PaymentOrderRow {
  id: number;
  user_id: number | null;
  order_no: string;
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

export interface CountRow {
  total: number;
}

