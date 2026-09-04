/**
 * 支付系统类型（仅前端纯数据，不含后端策略接口）
 *
 * @module types/payment
 * @description 支付渠道、订单创建/查询/回调、支付套餐快照等纯数据结构
 */

export type PaymentProviderName = "alipay" | "wechat" | "mock";

export type PaymentMode = "mock" | "live";

// （src/lib/services/training-payment.ts queryTrainingOrderStatus）
// 支付订单状态：待处理/成功/关闭/失败/过期  订单 30 分钟本地过期后查询会返回 expired
export type PaymentOrderStatus = "pending" | "paid" | "closed" | "failed" | "expired";

// 平台环境：微信/浏览器/APP
export type PlatformEnv = "wechat" | "browser" | "app";

// 支付订单套餐信息
export interface PaymentOrderPlan {
  plan_code: string; // 计划代码
  name: string; // 套餐名称
  description: string; // 套餐描述
  price: number; // 套餐价格
  currency: string; // 币种
  duration_days: number | null;  // 套餐时长天数
  unlock_quota: number;  // 解锁额度
  plan_type: "free" | "single" | "bundle" | "subscription";  // 套餐类型
}

// 创建订单
export interface CreateOrderRequest {
  user_id: number; // 自增ID 唯一标识
  plan_code: string; // 套餐代码
  provider: PaymentProviderName;
  notice_id?: number | null; // 解锁的资料 ID
  return_url?: string; // 回调 URL
  client_ip?: string; // 客户端 IP（微信支付 payer_client_ip 需要）
  order_type?: "new" | "upgrade"; // 订单类型：'new'（新购，默认）/ 'upgrade'（升级补差）
  original_plan_code?: string; // 升级时的当前套餐 code（服务端校验用）
  amount?: number; // 学习资料/打包套餐的指定金额（跳过套餐表查找）
  bundle_items?: string[]; // 打包套餐包含的资料 ID 列表（写入 raw_request 供履约解析）
}

// 订单信息
export interface OrderInfo {
  order_no: string; // 订单编号
  pay_url: string; // 支付 URL
  qr_code_url?: string; // 二维码 URL
  provider: PaymentProviderName; // 支付渠道
  status: PaymentOrderStatus; // 订单状态
  notice_id?: number | null; // 解锁的资料 ID
  payment_mode?: "configured" | "mock"; // 支付模式：configured=真实网关，mock=本地模拟
  plan_code?: string; // 套餐代码
  amount?: number; // 订单金额
  currency?: string; // 币种
  created_at?: string; // 创建时间
}

// 订单状态查询结果
export interface OrderStatusResult {
  order_no: string; // 订单编号
  status: PaymentOrderStatus; // 订单状态
  notice_id?: number | null; // 解锁的资料 ID
  provider?: PaymentProviderName; // 支付渠道 
  plan_code?: string; // 套餐代码
  amount?: number; // 订单金额
  currency?: string; // 币种
  provider_trade_no?: string; // 支付渠道订单编号
  paid_at?: string; // 支付时间
}

// 支付回调结果
export interface PaymentNotifyResult {
  success: boolean; // 是否成功
  order_no: string; // 订单编号
  provider_trade_no: string; // 支付渠道订单编号
  message?: string; // 错误信息
}

// 支付渠道配置
export interface PaymentProviderConfig {
  provider: PaymentProviderName; // 支付渠道
  mode: PaymentMode; // 支付模式
  app_id?: string; // 应用 ID
  merchant_id?: string; // 商户 ID
  notify_url?: string; // 通知 URL
  return_url?: string; // 回调 URL
  public_key?: string; // 公钥
  private_key_ref?: string; // 私钥
  cert_ref?: string; // 证书
  is_active: boolean; // 是否启用
}

