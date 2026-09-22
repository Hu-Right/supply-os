/**
 * 统一支付弹窗核心 — 向后兼容 re-export
 * Unified Payment Modal Core — Backward-compatible re-export
 *
 * @module features/payment/components/PaymentModalCore
 * @description 权威实现已提升至 shared/components/PaymentModalCore.tsx，
 *              本文件改为 re-export 保持存量导入路径兼容。
 *              新代码应直接从 @/shared/components/PaymentModalCore 导入。
 */
export { default } from "@/shared/components/PaymentModalCore";
export type {
  PaymentModalCoreProps,
  PaymentModalOrder,
  PaymentModalTexts,
  PaymentModalStep,
} from "@/shared/components/PaymentModalCore";
