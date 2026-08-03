/**
 * 支付系统类型（仅前端纯数据，不含后端策略接口）
 * Payment / Order Types (frontend data only, no backend strategy interfaces)
 *
 * @module types/payment
 * @description 支付渠道、订单创建/查询/回调、支付套餐快照等纯数据结构
 *              Payment provider, order creation/query/notification, and order plan snapshot types
 */

export type PaymentProviderName = "alipay" | "wechat" | "mock";

export type PaymentMode = "mock" | "live";

export type PaymentOrderStatus = "pending" | "paid" | "closed" | "failed";

export type PlatformEnv = "wechat" | "browser" | "app";

export interface PaymentOrderPlan {
  plan_code: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  duration_days: number | null;
  unlock_quota: number;
  plan_type: "free" | "single" | "bundle" | "subscription";
}

export interface CreateOrderRequest {
  user_key: string;
  plan_code: string;
  provider: PaymentProviderName;
  notice_id?: number | null;
  return_url?: string;
}

export interface CreateOrderResult {
  order_no: string;
  provider: PaymentProviderName;
  amount: number;
  currency: string;
  pay_url: string;
  qr_code_url?: string;
  status: PaymentOrderStatus;
  notice_id?: number | null;
  created_at: string;
}

export interface OrderStatusResult {
  order_no: string;
  status: PaymentOrderStatus;
  notice_id?: number | null;
  provider?: PaymentProviderName;
  plan_code?: string;
  amount?: number;
  currency?: string;
  provider_trade_no?: string;
  paid_at?: string;
}

export interface PaymentNotifyResult {
  success: boolean;
  order_no: string;
  provider_trade_no: string;
  message?: string;
}

export interface PaymentProviderConfig {
  provider: PaymentProviderName;
  mode: PaymentMode;
  app_id?: string;
  merchant_id?: string;
  notify_url?: string;
  return_url?: string;
  public_key?: string;
  private_key_ref?: string;
  cert_ref?: string;
  is_active: boolean;
}

