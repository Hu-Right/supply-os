/**
 * 支付操作门面 — 跨 feature 统一入口
 * Payment Facade — Cross-feature unified entry point
 *
 * @module core/payment/payment-facade
 * @description ARCH-P4a（2026-09-01）：权威实现已提升至同层 core/payment/api.ts，
 *              本文件改为 re-export 保持存量导入路径兼容。
 *              新代码应直接从 @/core/payment/api 导入。
 */
export {
  createOrder,
  getOrderStatus,
  mockPaid,
} from "./api";
export type { CreateOrderParams } from "./api";
export type { OrderInfo } from "@/types/payment";
