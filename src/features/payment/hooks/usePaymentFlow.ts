/**
 * 支付流程状态机 Hook — 向后兼容 re-export
 * Payment Flow State Machine Hook — Backward-compatible re-export
 *
 * @module features/payment/hooks/usePaymentFlow
 * @description 权威实现已提升至 shared/hooks/usePaymentFlow.ts，
 *              本文件改为 re-export 保持存量导入路径兼容。
 *              新代码应直接从 @/shared/hooks/usePaymentFlow 导入。
 */
export { usePaymentFlow } from "@/shared/hooks/usePaymentFlow";
export type {
  PaymentModalStep,
  PaymentModalOrder,
  UsePaymentFlowOptions,
  UsePaymentFlowReturn,
} from "@/shared/hooks/usePaymentFlow";
