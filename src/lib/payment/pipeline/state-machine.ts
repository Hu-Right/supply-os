/**
 * 统一订单状态机
 * Unified Order State Machine
 *
 * @module lib/payment/pipeline/state-machine
 * @description ARCH-PN（2026-09-11）：支付归一化重构——统一状态转换守卫。
 *              替代散落在各服务中的 `if (order.status !== "pending")` 硬编码，
 *              提供显式的状态转换规则定义与校验。
 *
 *              状态流转图：
 *              pending  → paid / closed / expired
 *              paid     → refunded
 *              expired  → paid（培训允许"迟到付款"复活）
 *              closed   → (终态)
 *              refunded → (终态)
 *              注：failed 已于 2026-11-12 退役（零写入点的死状态——网关下单失败
 *              根本不落单，支付失败的实际路径是 pending → closed）
 */
import { ORDER_STATUS } from "@/shared/constants/order-status";

/** 合法状态转换表 */
const TRANSITIONS: Record<string, readonly string[]> = {
  [ORDER_STATUS.PENDING]: [
    ORDER_STATUS.PAID,
    ORDER_STATUS.CLOSED,
    ORDER_STATUS.EXPIRED,
  ],
  [ORDER_STATUS.PAID]: [ORDER_STATUS.REFUNDED],
  [ORDER_STATUS.CLOSED]: [],
  [ORDER_STATUS.EXPIRED]: [ORDER_STATUS.PAID],
  [ORDER_STATUS.REFUNDED]: [],
};

/**
 * 判断状态转换是否合法
 */
export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 校验状态转换合法性，非法转换抛出明确错误
 */
export function assertValidTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new Error(`INVALID_STATE_TRANSITION: ${from} → ${to}`);
  }
}

/**
 * 判断是否为终态（不可再转换的状态）
 */
export function isTerminalStatus(status: string): boolean {
  const targets = TRANSITIONS[status];
  return targets !== undefined && targets.length === 0;
}

/**
 * 获取默认的状态转换白名单（供 fulfillInTransaction 使用）
 * 会员/学习：仅 pending 可履约
 * 培训：pending + expired 可履约（迟到付款）
 */
export const DEFAULT_FULFILL_ALLOWED: readonly string[] = [ORDER_STATUS.PENDING];
export const TRAINING_FULFILL_ALLOWED: readonly string[] = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.EXPIRED,
];
