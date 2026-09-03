/**
 * 支付编排层 — 跨业务统一入口
 * Payment Orchestrator — Cross-business unified entry point
 *
 * @module lib/payment/orchestrator
 * @description ARCH-B+（2026-09-01）：分表存储后的统一编排层。
 *              根据订单号前缀路由至对应业务服务：
 *              - SO → PaymentService（会员 / 公告解锁）
 *              - LE → LearningPaymentService（学习资料 / 打包套餐）
 *              - TR → 培训订单（TrainingRepo，已有独立路由）
 *
 *              职责：
 *              1. 支付回调验签 + 金额校验 + 路由分发
 *              2. 订单状态查询路由
 *              3. 退款逆向路由
 *              4. Mock 支付路由
 *              5. 渠道策略注册中心（统一注入 Alipay/Wechat/Mock）
 */
import type { PaymentProviderName } from "../types/payment";
import type { PaymentStrategy } from "./types";
import type { PaymentService } from "./PaymentService";
import type { LearningPaymentService } from "./learning-payment";
import type { PaymentsRepo } from "../repos/payments.repo";
import type { LearningOrdersRepo } from "../repos/learning-orders.repo";
import type { TrainingRepo } from "../repos/training.repo";
import type { PaymentHistoryRepo } from "../repos/payment-history.repo";

/** 聚合后的统一订单行 */
export interface NormalizedOrder {
  order_no: string;
  user_key: string;
  provider: string;
  plan_code: string;
  notice_id: number | null;
  amount: number;
  currency: string;
  status: string;
  provider_trade_no: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string | null;
}

/** 订单号前缀常量 */
export const ORDER_PREFIX = {
  MEMBERSHIP: "SO",
  LEARNING: "LE",
  TRAINING: "TR",
} as const;

/** 根据订单号判断业务类型 */
export function getOrderBusiness(orderNo: string): "membership" | "learning" | "training" | "unknown" {
  if (orderNo.startsWith(ORDER_PREFIX.LEARNING)) return "learning";
  if (orderNo.startsWith(ORDER_PREFIX.TRAINING)) return "training";
  if (orderNo.startsWith(ORDER_PREFIX.MEMBERSHIP)) return "membership";
  return "unknown";
}

export class PaymentOrchestrator {
  private strategies: Map<PaymentProviderName, PaymentStrategy> = new Map();

  constructor(
    private paymentService: PaymentService,
    private learningPaymentService: LearningPaymentService,
    private paymentsRepo: PaymentsRepo,
    private learningOrdersRepo: LearningOrdersRepo,
    private trainingRepo: TrainingRepo,
    private paymentHistoryRepo: PaymentHistoryRepo,
  ) {}

  // ── 渠道策略注册 ──────────────────────────────────────────────────────────

  registerStrategy(provider: PaymentProviderName, strategy: PaymentStrategy): void {
    this.strategies.set(provider, strategy);
    this.paymentService.registerStrategy(provider, strategy);
    this.learningPaymentService.registerStrategy(provider, strategy);
  }

  getStrategy(provider: PaymentProviderName): PaymentStrategy {
    const s = this.strategies.get(provider);
    if (!s) throw new Error(`Unsupported payment provider: ${provider}`);
    return s;
  }

  hasStrategy(provider: PaymentProviderName): boolean {
    return this.strategies.has(provider);
  }

  // ── 支付异步回调 ──────────────────────────────────────────────────────────

  /**
   * 统一支付回调入口。
   * 验签 → 提取 order_no → 按前缀路由 → 金额校验 → 业务履约
   */
  async handleNotify(
    provider: PaymentProviderName,
    rawBody: unknown,
    signature: string,
  ): Promise<{ success: boolean; order_no: string; message?: string }> {
    const strategy = this.getStrategy(provider);
    const verifyResult = await strategy.verifyCallback(rawBody, signature);

    // 退款 / 关闭通知路由（审查 F20）
    if (!verifyResult.verified && verifyResult.tradeStatus === "TRADE_CLOSED") {
      if (!verifyResult.order_no) {
        return { success: false, order_no: "", message: "ORDER_NO_MISSING" };
      }
      return this.refundOrder(verifyResult.order_no);
    }

    if (!verifyResult.verified) {
      return { success: false, order_no: verifyResult.order_no, message: "SIGN_VERIFY_FAILED" };
    }
    if (!verifyResult.order_no) {
      return { success: false, order_no: "", message: "ORDER_NO_MISSING" };
    }

    // 回调金额校验
    const callbackAmount = Number(verifyResult.amount || 0);
    if (callbackAmount <= 0) {
      return { success: false, order_no: verifyResult.order_no, message: "AMOUNT_INVALID" };
    }

    // 按前缀路由至对应业务
    const business = getOrderBusiness(verifyResult.order_no);
    switch (business) {
      case "learning": {
        const dbOrder = await this.learningOrdersRepo.findOrderAmount(verifyResult.order_no);
        if (!dbOrder) {
          return { success: false, order_no: verifyResult.order_no, message: "ORDER_NOT_FOUND" };
        }
        if (dbOrder.amount > 0 && Math.abs(dbOrder.amount - callbackAmount) > 0.01) {
          return { success: false, order_no: verifyResult.order_no, message: "AMOUNT_MISMATCH" };
        }
        await this.learningPaymentService.fulfillOrder(verifyResult.order_no, verifyResult.provider_trade_no);
        return { success: true, order_no: verifyResult.order_no };
      }

      case "membership":
      default:
        // 会员订单完整走 PaymentService.handleNotify（含验签 + 金额校验 + 履约 + TRADE_CLOSED 退款）
        return this.paymentService.handleNotify(provider, rawBody, signature);
    }
  }

  // ── 订单状态查询 ──────────────────────────────────────────────────────────

  async queryOrder(orderNo: string, providerTradeNo?: string) {
    const business = getOrderBusiness(orderNo);
    switch (business) {
      case "learning":
        return this.learningPaymentService.queryOrder(orderNo, providerTradeNo);
      case "membership":
      default:
        return this.paymentService.queryOrder(orderNo, providerTradeNo);
    }
  }

  // ── 退款逆向 ──────────────────────────────────────────────────────────────

  async refundOrder(orderNo: string): Promise<{ success: boolean; order_no: string; message: string }> {
    const business = getOrderBusiness(orderNo);
    switch (business) {
      case "learning": {
        const result = await this.learningPaymentService.reverseOrder(orderNo);
        if (!result.found) {
          return { success: false, order_no: orderNo, message: "ORDER_NOT_FOUND" };
        }
        return {
          success: true, order_no: orderNo,
          message: result.reversed ? "REFUND_REVERSED" : "REFUND_NO_ACTION",
        };
      }
      case "membership":
      default: {
        const { reverseFulfilledOrder } = await import("./reverse");
        const result = await reverseFulfilledOrder(this.paymentsRepo, orderNo);
        if (!result.found) {
          return { success: false, order_no: orderNo, message: "ORDER_NOT_FOUND" };
        }
        return {
          success: true, order_no: orderNo,
          message: result.reversed ? "REFUND_REVERSED" : "REFUND_NO_ACTION",
        };
      }
    }
  }

  // ── Mock 支付 ─────────────────────────────────────────────────────────────

  async fulfillMockOrder(
    orderNo: string,
    userKey: string,
    rawNotify: string,
  ): Promise<{ found: boolean; business: string }> {
    const business = getOrderBusiness(orderNo);
    switch (business) {
      case "learning": {
        const result = await this.learningPaymentService.fulfillMockOrder(orderNo, rawNotify);
        return { found: result.found, business };
      }
      case "membership":
      default: {
        const found = await this.paymentService.fulfillMockMembershipOrder(orderNo, userKey, rawNotify);
        return { found, business };
      }
    }
  }

  // ── 订单查找（身份校验用） ────────────────────────────────────────────────

  async findOrder(orderNo: string): Promise<{ user_key: string; status: string } | null> {
    const business = getOrderBusiness(orderNo);
    switch (business) {
      case "learning": {
        const order = await this.learningOrdersRepo.findByOrderNo(orderNo);
        return order ? { user_key: order.user_key, status: order.status } : null;
      }
      case "training": {
        const order = await this.trainingRepo.findOrderByNo(orderNo);
        return order ? { user_key: order.user_key || "", status: order.status } : null;
      }
      case "membership":
      default: {
        const order = await this.paymentsRepo.findByOrderNo(orderNo);
        return order ? { user_key: order.user_key, status: order.status } : null;
      }
    }
  }

  // ── 全量订单历史聚合 ────────────────────────────────────────────────────────

  /** 统一订单行（聚合三表后的公共字段） */
  private normalizeOrder(row: {
    order_no: string; user_key: string; provider: string; plan_code: string;
    amount: number | string; currency: string; status: string;
    provider_trade_no: string | null; paid_at: Date | string | null;
    created_at: Date | string; updated_at: Date | string | null;
    notice_id?: number | null;
  }): NormalizedOrder {
    return {
      order_no: row.order_no,
      user_key: row.user_key,
      provider: row.provider,
      plan_code: row.plan_code,
      notice_id: row.notice_id ?? null,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      provider_trade_no: row.provider_trade_no,
      paid_at: row.paid_at ? new Date(row.paid_at as string).toISOString() : null,
      created_at: new Date(row.created_at as string).toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
    };
  }

  /**
   * 聚合三张订单表，返回全量订单历史（按 created_at 降序）。
   * 会员订单保留 PaymentHistoryRepo 的 LEFT JOIN 公告摘要能力。
   */
  async listAllOrders(
    userId: number, status: string, limit: number, offset: number,
  ): Promise<{ total: number; list: NormalizedOrder[] }> {
    const statusParam = status && status !== "all" ? status : "";

    const [membershipOrders, learningOrders, trainingOrders, membershipTotal, learningTotal, trainingTotal] = await Promise.all([
      this.paymentHistoryRepo.listOrders(userId, statusParam, 9999, 0),
      this.learningOrdersRepo.findByUserKey(userId, statusParam),
      this.trainingRepo.findOrdersByUserKey(userId, statusParam),
      this.paymentHistoryRepo.countOrders(userId, statusParam),
      this.learningOrdersRepo.countByUserKey(userId, statusParam),
      this.trainingRepo.countOrdersByUserKey(userId, statusParam),
    ]);

    const total = membershipTotal + learningTotal + trainingTotal;

    const all = [
      ...membershipOrders.map((o) => this.normalizeOrder(o)),
      ...learningOrders.map((o) => this.normalizeOrder(o)),
      ...trainingOrders.map((o) => this.normalizeOrder({
        order_no: o.order_no, user_key: o.user_key || "", provider: o.provider,
        plan_code: `training_course_${o.course_id}`, amount: o.total_amount,
        currency: o.currency, status: o.status, provider_trade_no: o.provider_trade_no,
        paid_at: o.paid_at, created_at: o.created_at as unknown as Date,
        updated_at: null,
      })),
    ];

    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const list = all.slice(offset, offset + limit);
    return { total, list };
  }
}
