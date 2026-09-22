/**
 * 研修班培训支付服务 — 向后兼容 re-export barrel
 * Training Payment Service — Backward-compatible re-export barrel
 *
 * @module server/services/training-payment
 * @description ARCH-PN（2026-09-11）：权威实现已迁移至 lib/payment/TrainingPaymentService 类。
 *              本文件保留原有函数签名作为兼容层，内部委托给 TrainingPaymentService。
 *              新代码应从 @/lib/payment/TrainingPaymentService 直接导入类。
 *
 *              原函数 → 类方法映射：
 *              - createTrainingOrder(ctx, repo, params) → new TrainingPaymentService(repo).createOrder(params)
 *              - queryTrainingOrderStatus(ctx, repo, orderNo) → service.queryOrder(orderNo)
 *              - fulfillTrainingOrder(repo, orderNo, tradeNo) → service.fulfillOrder(orderNo, tradeNo)
 *              - reverseTrainingOrder(repo, orderNo) → service.reverseOrder(orderNo)
 *              - fulfillMockTrainingOrder(repo, orderNo, rawNotify) → service.fulfillMockOrder(orderNo, rawNotify)
 */
import type { AppContext } from "../db/context";
import type { TrainingRepo } from "../repos/training.repo";
import type { PaymentProviderName } from "../types/payment";
import { TrainingPaymentService } from "../payment/TrainingPaymentService";

// ── 类型 re-export ────────────────────────────────────────────────────────────

export type { CreateTrainingOrderParams, TrainingOrderResult } from "../payment/TrainingPaymentService";

// ── 内部辅助：创建并初始化 TrainingPaymentService 实例 ────────────────────────

function createService(trainingRepo: TrainingRepo, ctx?: AppContext): TrainingPaymentService {
  const service = new TrainingPaymentService(trainingRepo);
  if (ctx) {
    const { orchestrator, paymentMode } = ctx.payment;
    service.setStrategyResolver({
      getStrategy: (p: PaymentProviderName) => orchestrator.getStrategy(p),
      hasStrategy: (p: PaymentProviderName) => orchestrator.hasStrategy(p),
      paymentMode,
    });
  }
  return service;
}

// ── 兼容层函数（保持原有签名） ────────────────────────────────────────────────

/**
 * 创建培训支付订单
 * @deprecated 新代码应使用 `new TrainingPaymentService(repo).createOrder(params)`
 */
export async function createTrainingOrder(
  ctx: AppContext,
  trainingRepo: TrainingRepo,
  params: Parameters<TrainingPaymentService["createOrder"]>[0],
): Promise<ReturnType<TrainingPaymentService["createOrder"]>> {
  return createService(trainingRepo, ctx).createOrder(params);
}

/**
 * 查询培训订单状态
 * @deprecated 新代码应使用 `new TrainingPaymentService(repo).queryOrder(orderNo)`
 */
export async function queryTrainingOrderStatus(
  ctx: AppContext,
  trainingRepo: TrainingRepo,
  orderNo: string,
): Promise<ReturnType<TrainingPaymentService["queryOrder"]>> {
  return createService(trainingRepo, ctx).queryOrder(orderNo);
}

/**
 * 培训订单支付履约
 * @deprecated 新代码应使用 `new TrainingPaymentService(repo).fulfillOrder(orderNo, tradeNo)`
 */
export async function fulfillTrainingOrder(
  trainingRepo: TrainingRepo,
  orderNo: string,
  providerTradeNo?: string | null,
): Promise<void> {
  return createService(trainingRepo).fulfillOrder(orderNo, providerTradeNo);
}

/**
 * 培训订单退款逆向
 * @deprecated 新代码应使用 `new TrainingPaymentService(repo).reverseOrder(orderNo)`
 */
export async function reverseTrainingOrder(
  trainingRepo: TrainingRepo,
  orderNo: string,
): Promise<{ found: boolean; reversed: boolean }> {
  return createService(trainingRepo).reverseOrder(orderNo);
}

/**
 * Mock 支付履约（培训订单）
 * @deprecated 新代码应使用 `new TrainingPaymentService(repo).fulfillMockOrder(orderNo, rawNotify)`
 */
export async function fulfillMockTrainingOrder(
  trainingRepo: TrainingRepo,
  orderNo: string,
  rawNotify: string,
): Promise<{ found: boolean }> {
  return createService(trainingRepo).fulfillMockOrder(orderNo, rawNotify);
}
