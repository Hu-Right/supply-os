/**
 * 支付公共管道层 — barrel 导出
 * Payment Pipeline Layer — Barrel Export
 *
 * @module lib/payment/pipeline
 * @description ARCH-PN（2026-09-11）：支付归一化重构的公共管道层。
 *              提取三个支付服务（PaymentService / LearningPaymentService / TrainingPaymentService）
 *              中重复的横切逻辑为可复用的管道函数。
 *
 *              包含：
 *              - queryOrderWithGatewayPoll: 统一订单查询 + 网关轮询
 *              - fulfillInTransaction: 统一事务履约模板
 *              - canTransition / assertValidTransition: 统一状态转换守卫
 *              - resolvePaymentProvider: 统一渠道解析
 */

// 统一查询管道
export { queryOrderWithGatewayPoll } from "./query-pipeline";
export type { QueryableOrderRow, QueryPipelineInput, QueryPipelineResult } from "./query-pipeline";

// 统一事务履约模板
export { fulfillInTransaction } from "./fulfill-template";
export type { FulfillableOrderRow, FulfillTransactionInput } from "./fulfill-template";

// 统一状态机
export {
  canTransition,
  assertValidTransition,
  isTerminalStatus,
  DEFAULT_FULFILL_ALLOWED,
  TRAINING_FULFILL_ALLOWED,
} from "./state-machine";

// 统一渠道解析
export { resolvePaymentProvider } from "./provider-resolver";
