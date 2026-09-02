/**
 * 支付系统类型（服务端 re-export）
 * Payment / Order Types
 *
 * @module server/types/payment
 * @description 统一类型单一事实源：re-export 自 src/types/payment.ts。
 *              服务端代码通过相对路径 `../types/payment` 导入，
 *              实际指向权威定义，消除双写同步风险。
 */
export type {
  PaymentProviderName,
  PaymentMode,
  PaymentOrderStatus,
  PlatformEnv,
  PaymentOrderPlan,
  CreateOrderRequest,
  OrderInfo,
  OrderStatusResult,
  PaymentNotifyResult,
  PaymentProviderConfig,
} from "../../types/payment";
