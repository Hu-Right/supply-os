/**
 * 统一订单查询管道
 * Unified Order Query Pipeline
 *
 * @module lib/payment/pipeline/query-pipeline
 * @description ARCH-PN（2026-09-11）：支付归一化重构——提取三个服务中完全重复的
 *              "查 DB → pending 时轮询网关 → 已付则触发履约"模式。
 *
 *              消费方：PaymentService.queryOrder()、LearningPaymentService.queryOrder()、
 *              TrainingPaymentService.queryOrder()。
 *              各服务只需提供 findOrder / getStrategy / onFulfill 三个回调。
 */
import type { PaymentProviderName } from "../../types/payment";
import type { PaymentStrategy } from "../types";
import { ORDER_STATUS } from "@/shared/constants/order-status";

/** 管道所需的订单行最小字段 */
export interface QueryableOrderRow {
  order_no: string;
  status: string;
  provider: string;
  provider_trade_no?: string | null;
  plan_code?: string;
  amount?: number | string;
  currency?: string;
  paid_at?: Date | string | null;
  notice_id?: number | null;
}

/** 查询管道输入 */
export interface QueryPipelineInput {
  /** 从 DB 查找订单（各服务提供各自的查询实现） */
  findOrder: () => Promise<QueryableOrderRow | null>;
  /** 获取支付渠道策略（来自 Orchestrator 统一注册中心） */
  getStrategy: (provider: PaymentProviderName) => PaymentStrategy;
  /** 订单已支付时的履约回调（各服务提供各自的权益发放逻辑） */
  onFulfill: (orderNo: string, providerTradeNo: string) => Promise<void>;
  /** 订单号 */
  orderNo: string;
  /** 支付渠道交易号（可选，网关查询用） */
  providerTradeNo?: string;
}

/** 查询管道返回结果 */
export interface QueryPipelineResult {
  order_no: string;
  status: string;
  provider?: PaymentProviderName;
  plan_code?: string;
  amount?: number;
  currency?: string;
  provider_trade_no?: string;
  paid_at?: string;
  notice_id?: number | null;
}

/**
 * 统一订单查询管道。
 *
 * 流程：
 * 1. 调用 findOrder() 获取 DB 订单
 * 2. 订单不存在 → 返回 { status: "closed" }
 * 3. 订单为 pending → 调用网关查询
 *    a. 网关确认 paid → 调用 onFulfill() 触发履约 → 返回 paid
 *    b. 网关返回非 pending → 直接返回网关状态
 *    c. 网关查询失败 → 保持 DB 状态（静默重试）
 * 4. 订单非 pending → 直接返回 DB 状态
 */
export async function queryOrderWithGatewayPoll(
  input: QueryPipelineInput,
): Promise<QueryPipelineResult> {
  const { findOrder, getStrategy, onFulfill, orderNo, providerTradeNo } = input;

  const dbOrder = await findOrder();
  if (!dbOrder) {
    return { order_no: orderNo, status: ORDER_STATUS.CLOSED };
  }

  // 非 pending 状态直接返回 DB 值（无需轮询网关）
  if (dbOrder.status !== ORDER_STATUS.PENDING) {
    return {
      order_no: dbOrder.order_no,
      status: dbOrder.status,
      provider: dbOrder.provider as PaymentProviderName,
      plan_code: dbOrder.plan_code,
      amount: Number(dbOrder.amount || 0),
      currency: dbOrder.currency || "CNY",
      provider_trade_no: dbOrder.provider_trade_no || undefined,
      paid_at: dbOrder.paid_at ? new Date(dbOrder.paid_at as string).toISOString() : undefined,
      notice_id: dbOrder.notice_id ?? null,
    };
  }

  // pending → 主动向网关轮询
  if (dbOrder.provider) {
    try {
      const strategy = getStrategy(dbOrder.provider as PaymentProviderName);
      const result = await strategy.queryOrderStatus(orderNo, providerTradeNo);

      if (result.status === ORDER_STATUS.PAID) {
        // 网关确认已付 → 触发履约（幂等）
        await onFulfill(orderNo, result.provider_trade_no || "");
        return {
          order_no: orderNo,
          status: ORDER_STATUS.PAID,
          provider: dbOrder.provider as PaymentProviderName,
          plan_code: dbOrder.plan_code,
          amount: Number(dbOrder.amount || 0),
          currency: dbOrder.currency || "CNY",
          provider_trade_no: result.provider_trade_no,
          paid_at: new Date().toISOString(),
          notice_id: dbOrder.notice_id ?? null,
        };
      }

      if (result.status !== ORDER_STATUS.PENDING) {
        // 网关返回非 pending 终态（如 closed/failed）
        return {
          order_no: orderNo,
          status: result.status,
          provider: dbOrder.provider as PaymentProviderName,
          plan_code: dbOrder.plan_code,
          amount: Number(dbOrder.amount || 0),
          currency: dbOrder.currency || "CNY",
          provider_trade_no: result.provider_trade_no,
          notice_id: dbOrder.notice_id ?? null,
        };
      }
    } catch {
      // 网关不可用时保持数据库状态，静默重试
    }
  }

  // 仍为 pending（网关不可用或确认 pending）
  return {
    order_no: dbOrder.order_no,
    status: dbOrder.status,
    provider: dbOrder.provider as PaymentProviderName,
    plan_code: dbOrder.plan_code,
    amount: Number(dbOrder.amount || 0),
    currency: dbOrder.currency || "CNY",
    provider_trade_no: dbOrder.provider_trade_no || undefined,
    paid_at: dbOrder.paid_at ? new Date(dbOrder.paid_at as string).toISOString() : undefined,
    notice_id: dbOrder.notice_id ?? null,
  };
}
