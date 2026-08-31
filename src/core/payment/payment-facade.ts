/**
 * 支付操作门面 — 跨 feature 统一入口
 * Payment Facade — Cross-feature unified entry point
 *
 * @module core/payment/payment-facade
 * @description ARCH-P2a（2026-08-31）：将支付订单创建/查单/模拟确认三个核心操作
 *              从 features/payment/api 提升至 core 层门面，供 procurement/training
 *              等跨 feature 消费方直接导入，消除 feature 间横向依赖。
 *              权威实现仍在 features/payment/api.ts，本文件为 re-export 门面。
 */
export {
  createOrder,
  getOrderStatus,
  mockPaid,
} from "@/features/payment/api";
export type { CreateOrderParams } from "@/features/payment/api";
export type { OrderInfo } from "@/types/payment";
