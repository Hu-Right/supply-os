/**
 * 支付功能模块入口
 * Payment Feature Module Entry
 *
 * @module features/payment
 * @description 统一导出支付弹窗组件和 hooks
 *              Unified exports for payment modal component and hooks
 */

export { default as PaymentModal } from "./components/PaymentModal";
export { default } from "./components/PaymentModal";
export { default as PaymentModalCore } from "./components/PaymentModalCore";
export type {
  PaymentModalCoreProps,
  PaymentModalOrder,
  PaymentModalTexts,
  PaymentModalStep,
} from "./components/PaymentModalCore";
export { useOrderHistory } from "./hooks/useOrderHistory";
export type { PurchaseTab, UseOrderHistoryReturn } from "./hooks/useOrderHistory";
export { usePaymentPolling } from "./hooks/usePaymentPolling";
export type { UsePaymentPollingCallbacks, UsePaymentPollingOptions, UsePaymentPollingReturn } from "./hooks/usePaymentPolling";
export { MyRecordsPanel } from "./components/MyRecordsPanel";
export { RecentUnlocks } from "./components/RecentUnlocks";
export type { RecentUnlocksProps } from "./components/RecentUnlocks";
export { fetchOrders, fetchUnlocks, getOrderStatus, createOrder, mockPaid } from "./api";
export type {
  OrderInfo,
  CreateOrderParams,
  OrderRecord,
  UnlockRecord,
  OrderNoticeBrief,
  PagedResult,
} from "./api";
