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

// expired 为真实终态：培训订单 30 分钟本地过期后查询会返回 expired
// （src/lib/services/training-payment.ts queryTrainingOrderStatus）
export type PaymentOrderStatus = "pending" | "paid" | "closed" | "failed" | "expired";

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
  /** 内部用户 ID */
  user_id: number;
  /** 用户标识（兼容保留，仅写入 raw_request 与订单表双写列） */
  user_key?: string;
  plan_code: string;
  provider: PaymentProviderName;
  notice_id?: number | null;
  return_url?: string;
  /** 客户端 IP（微信支付 payer_client_ip 需要） */
  client_ip?: string;
  /** 订单类型：'new'（新购，默认）/ 'upgrade'（升级补差） */
  order_type?: "new" | "upgrade";
  /** 升级时的当前套餐 code（服务端校验用） */
  original_plan_code?: string;
  /** 学习资料/打包套餐的指定金额（跳过套餐表查找） */
  amount?: number;
  /** 打包套餐包含的资料 ID 列表（写入 raw_request 供履约解析） */
  bundle_items?: string[];
}

export interface OrderInfo {
  order_no: string;
  pay_url: string;
  qr_code_url?: string;
  provider: PaymentProviderName;
  status: PaymentOrderStatus;
  notice_id?: number | null;
  /** 支付模式：configured=真实网关，mock=本地模拟 */
  payment_mode?: "configured" | "mock";
  plan_code?: string;
  amount?: number;
  currency?: string;
  created_at?: string;
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

