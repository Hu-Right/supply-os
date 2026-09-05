/**
 * 支付轮询状态机 Hook — 向后兼容 re-export
 * Payment Polling State Machine Hook — Backward-compatible re-export
 *
 * @module features/payment/hooks/usePaymentPolling
 * @description ARCH-P2-解耦（2026-09-05）：权威实现已提升至 shared/hooks/usePaymentPolling，
 *              本文件改为 re-export 保持存量导入路径兼容。
 *              新代码应直接从 @/shared/hooks/usePaymentPolling 导入。
 */
export { usePaymentPolling } from "@/shared/hooks/usePaymentPolling";
export type {
  UsePaymentPollingCallbacks,
  UsePaymentPollingOptions,
  UsePaymentPollingReturn,
} from "@/shared/hooks/usePaymentPolling";
