/**
 * 支付编排层 — 跨业务统一入口
 *
 * @module lib/payment/orchestrator
 * @description ARCH-B+（2026-09-01）+ ARCH-PN（2026-09-11）：分表存储后的统一编排层。
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
import type { ServicePaymentService } from "./service-payment";
import type { ServiceOrdersRepo } from "../repos/service-orders.repo";
import type { TrainingRepo } from "../repos/training.repo";
import type { PaymentHistoryRepo, UnifiedOrderHistoryRow } from "../repos/payment-history.repo";
import type { BenefitFulfillDeps } from "./benefit-grant";
import { TrainingPaymentService } from "./TrainingPaymentService";

/**
 * 聚合后的统一订单行——这就是 GET /api/payment/orders 的 list 元素（对外响应体），
 * 所以键名按红线② 用 camelCase；入参侧的 DB 行列名（normalizeOrder 的 row 参数）
 * 仍是 snake，不得跟着改。
 */
export interface NormalizedOrder {
  orderNo: string; // 订单编号
  userId: number; // 内部用户 ID
  businessType: "membership" | "learning" | "training" | "service"; // ARCH-PN：业务类型
  provider: string; // 支付渠道
  planCode: string; // 套餐代码
  noticeId: number | null; // 2026-11-12 起 orders 退役该列（死列），恒为 null，键位保留维持 wire 契约
  amount: number; // 订单金额
  currency: string; // 币种
  status: string; // 订单状态
  providerTradeNo: string | null; // 支付渠道订单编号
  paidAt: string | null; // 支付时间
  createdAt: string; // 创建时间
  updatedAt: string | null; // 更新时间
  expiresAt: string | null; // ARCH-PN：过期时间
}

// 订单号前缀常量  SO：会员服务，LE：学习资料，TR：培训
export const ORDER_PREFIX = {
  MEMBERSHIP: "SO",
  LEARNING: "LE",
  TRAINING: "TR",
  SERVICE: "SV",
} as const;

// 根据订单号判断支付订单的类型
export function getOrderBusiness(orderNo: string): "membership" | "learning" | "training" | "service" | "unknown" {
  if (orderNo.startsWith(ORDER_PREFIX.SERVICE)) return "service";
  if (orderNo.startsWith(ORDER_PREFIX.LEARNING)) return "learning";
  if (orderNo.startsWith(ORDER_PREFIX.TRAINING)) return "training";
  if (orderNo.startsWith(ORDER_PREFIX.MEMBERSHIP)) return "membership";
  return "unknown";
}

/** product_kind → 对外业务类型（订单历史里的 businessType） */
const BUSINESS_OF_KIND: Record<string, "membership" | "learning" | "training" | "service"> = {
  plan: "membership",
  material: "learning",
  bundle: "learning",
  service: "service",
  course: "training",
};

/**
 * product_kind + 目录主键 → 旧码形。
 * 前端 `recordTitle`、`getOrderBusiness` 与既有响应契约都按码形判类型，
 * 合一表后不能把 `material_x` 直接吐成 `x`。
 * course 的 `training_course_N` 本就是订单列表拼出来的展示码，不是真实 SKU。
 */
function legacyProductCode(kind: string, code: string): string {
  if (kind === "material" || kind === "bundle") return `${kind}_${code}`;
  if (kind === "course") return `training_course_${code}`;
  return code;
}

// 支付编排器
export class PaymentOrchestrator {
  private strategies: Map<PaymentProviderName, PaymentStrategy> = new Map();
  /** 培训支付履约/逆向/Mock 入口（无需渠道策略，直接用 repo 构造） */
  private trainingPaymentService: TrainingPaymentService;

  constructor(
    private paymentService: PaymentService,
    private learningPaymentService: LearningPaymentService,
    private paymentsRepo: PaymentsRepo,
    private learningOrdersRepo: LearningOrdersRepo,
    private trainingRepo: TrainingRepo,
    private servicePaymentService: ServicePaymentService,
    private serviceOrdersRepo: ServiceOrdersRepo,
    private paymentHistoryRepo: PaymentHistoryRepo,
    /** 权益体系双轨：会员履约/逆向的新表组依赖（与 PaymentService 同一实例，由 AppContext 注入） */
    private benefitDeps: BenefitFulfillDeps,
  ) {
    this.trainingPaymentService = new TrainingPaymentService(this.trainingRepo);
  }

  // ── 渠道策略注册（唯一注册中心） ──────────────────────────────────────────

  /**
   * ARCH-PN（2026-09-11）：策略注册收归 Orchestrator 统一管理。
   * 注册时同步向子服务注入策略解析器，消除三重冗余注册。
   */
  registerStrategy(provider: PaymentProviderName, strategy: PaymentStrategy): void {
    this.strategies.set(provider, strategy);
    // 向子服务注入策略解析闭包（幂等：每次注册都覆写，确保 hasStrategy 返回最新值）
    this.paymentService.setStrategyResolver({
      getStrategy: (p) => this.getStrategy(p),
      hasStrategy: (p) => this.hasStrategy(p),
    });
    this.learningPaymentService.setStrategyResolver({
      getStrategy: (p) => this.getStrategy(p),
    });
    this.servicePaymentService.setStrategyResolver({
      getStrategy: (p) => this.getStrategy(p),
    });
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
    rawBody: Record<string, unknown>,
    signature: string,
  ): Promise<{ success: boolean; order_no: string; message?: string }> {
    const strategy = this.getStrategy(provider);
    const verifyResult = await strategy.verifyCallback(rawBody, signature);

    // 退款 / 关闭通知路由（审查 F20）。
    // TRADE_CLOSED 有两种成因，分两路：
    //   · 已付单 → 全额退款后关闭 → 进各业务退款逆向（回收订阅/额度，落 refunded）
    //   · 未付单 → 用户超时未付被渠道关单 → 立即 closed（不等 sweeper；钱没进过账，
    //     落 refunded 会虚增退款口径——2026-11-12 修正）
    if (!verifyResult.verified && verifyResult.tradeStatus === "TRADE_CLOSED") {
      if (!verifyResult.order_no) {
        return { success: false, order_no: "", message: "ORDER_NO_MISSING" };
      }
      const pendingClosed = await this.paymentsRepo.closePendingOrder(verifyResult.order_no);
      if (pendingClosed) {
        return { success: true, order_no: verifyResult.order_no, message: "PENDING_CLOSED" };
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

      case "training": {
        // ARCH-P0（2026-09-05）：培训订单回调履约通道
        // 此前 TR 前缀订单落入 default 分支，在 payments_repo 中查找恒返 ORDER_NOT_FOUND，
        // 导致"用户付了钱但无履约"。修复：独立路由至培训履约（orders kind='course'）。
        const trainingOrder = await this.trainingRepo.findOrderByNo(verifyResult.order_no);
        if (!trainingOrder) {
          return { success: false, order_no: verifyResult.order_no, message: "ORDER_NOT_FOUND" };
        }
        if (Number(trainingOrder.total_amount) > 0 &&
            Math.abs(Number(trainingOrder.total_amount) - callbackAmount) > 0.01) {
          return { success: false, order_no: verifyResult.order_no, message: "AMOUNT_MISMATCH" };
        }
        await this.trainingPaymentService.fulfillOrder(verifyResult.order_no, verifyResult.provider_trade_no);
        return { success: true, order_no: verifyResult.order_no };
      }

      case "service": {
        const dbOrder = await this.serviceOrdersRepo.findOrderAmount(verifyResult.order_no);
        if (!dbOrder) {
          return { success: false, order_no: verifyResult.order_no, message: "ORDER_NOT_FOUND" };
        }
        if (Number(dbOrder.amount) > 0 && Math.abs(Number(dbOrder.amount) - callbackAmount) > 0.01) {
          return { success: false, order_no: verifyResult.order_no, message: "AMOUNT_MISMATCH" };
        }
        await this.servicePaymentService.fulfillOrder(verifyResult.order_no);
        return { success: true, order_no: verifyResult.order_no };
      }

      case "membership":
      default: {
        // ARCH-PN（2026-09-11）：会员订单不再重复走 PaymentService.handleNotify（验签已在上方完成），
        // 直接进行金额校验 + 履约，消除重复验签。
        const dbOrder = await this.paymentsRepo.findOrderAmount(verifyResult.order_no);
        if (!dbOrder) {
          return { success: false, order_no: verifyResult.order_no, message: "ORDER_NOT_FOUND" };
        }
        if (dbOrder.amount > 0 && Math.abs(dbOrder.amount - callbackAmount) > 0.01) {
          return { success: false, order_no: verifyResult.order_no, message: "AMOUNT_MISMATCH" };
        }
        const { activatePaidOrder } = await import("./activate");
        await activatePaidOrder(this.paymentsRepo, verifyResult.order_no, verifyResult.provider_trade_no, this.benefitDeps);
        return { success: true, order_no: verifyResult.order_no };
      }
    }
  }

  // ── 订单状态查询 ──────────────────────────────────────────────────────────

  /**
   * 培训订单查询分支：需要 AppContext 以访问支付策略，此处直接查 DB 状态。
   * 返回体与其余三个分支同走对外契约（红线② camelCase）；金额键与
   * membership/learning/service 一致用 amount（DB 列 total_amount 是行形状）。
   */
  async queryOrder(orderNo: string, providerTradeNo?: string) {
    const business = getOrderBusiness(orderNo);
    switch (business) {
      case "learning":
        return this.learningPaymentService.queryOrder(orderNo, providerTradeNo);
      case "training": {
        const order = await this.trainingRepo.findOrderByNo(orderNo);
        if (!order) return { orderNo, status: "closed" };
        return {
          orderNo: order.order_no,
          status: order.status,
          amount: Number(order.total_amount || 0),
          paidAt: order.paid_at ? new Date(order.paid_at).toISOString() : null,
        };
      }
      case "service":
        return this.servicePaymentService.queryOrder(orderNo);
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
      case "training": {
        // ARCH-P0（2026-09-05）：培训订单退款逆向
        const result = await this.trainingPaymentService.reverseOrder(orderNo);
        if (!result.found) {
          return { success: false, order_no: orderNo, message: "ORDER_NOT_FOUND" };
        }
        return {
          success: true, order_no: orderNo,
          message: result.reversed ? "REFUND_REVERSED" : "REFUND_NO_ACTION",
        };
      }
      case "service": {
        const result = await this.servicePaymentService.reverseOrder(orderNo);
        if (!result.found) {
          return { success: false, order_no: orderNo, message: "ORDER_NOT_FOUND" };
        }
        return { success: true, order_no: orderNo, message: result.reversed ? "REFUND_REVERSED" : "REFUND_NO_ACTION" };
      }
      case "membership":
      default: {
        const { reverseFulfilledOrder } = await import("./reverse");
        const result = await reverseFulfilledOrder(this.paymentsRepo, orderNo, this.benefitDeps);
        if (!result.found) {
          return { success: false, order_no: orderNo, message: "ORDER_NOT_FOUND" };
        }
        return {
          success: true, order_no: orderNo,
          message: result.review_required ? "REFUND_REVIEW_REQUIRED" : result.reversed ? "REFUND_REVERSED" : "REFUND_NO_ACTION",
        };
      }
    }
  }

  // ── Mock 支付 ─────────────────────────────────────────────────────────────

  async fulfillMockOrder(
    orderNo: string,
    rawNotify: string,
  ): Promise<{ found: boolean; business: string }> {
    const business = getOrderBusiness(orderNo);
    switch (business) {
      case "learning": {
        const result = await this.learningPaymentService.fulfillMockOrder(orderNo, rawNotify);
        return { found: result.found, business };
      }
      case "training": {
        const result = await this.trainingPaymentService.fulfillMockOrder(orderNo, rawNotify);
        return { found: result.found, business };
      }
      case "service": {
        const result = await this.servicePaymentService.fulfillMockOrder(orderNo);
        return { found: result.found, business };
      }
      case "membership":
      default: {
        const found = await this.paymentService.fulfillMockMembershipOrder(orderNo, rawNotify);
        return { found, business };
      }
    }
  }

  // ── 订单查找（身份校验用） ────────────────────────────────────────────────
  /**
   * 仅供路由做身份校验、不进出参响应体，因此保留 DB 行列名 user_id：
   * 它是行形状而非对外契约，跟着视图改名反而误导。
   */
  async findOrder(orderNo: string): Promise<{ user_id: number; status: string } | null> {
    const business = getOrderBusiness(orderNo);
    switch (business) {
      case "learning": {
        const order = await this.learningOrdersRepo.findByOrderNo(orderNo);
        return order ? { user_id: order.user_id!, status: order.status } : null;
      }
      case "training": {
        const order = await this.trainingRepo.findOrderByNo(orderNo);
        return order ? { user_id: order.user_id!, status: order.status } : null;
      }
      case "service": {
        const order = await this.serviceOrdersRepo.findByOrderNo(orderNo);
        return order ? { user_id: order.user_id, status: order.status } : null;
      }
      case "membership":
      default: {
        const order = await this.paymentsRepo.findByOrderNo(orderNo);
        return order ? { user_id: order.user_id!, status: order.status } : null;
      }
    }
  }

  // ── 全量订单历史聚合 ────────────────────────────────────────────────────────

  /**
   * 订单历史（统一表 `orders`，一次带 LIMIT/OFFSET 的查询）。
   *
   * 2026-11-12 合一表后这里不再需要「四表各拉全量 → 内存排序 → slice」：
   * 原来会员侧固定拉 9999 行，订单一多必炸；现在分页下沉到 DB，`created_at + id`
   * 双键排序保证翻页稳定。
   *
   * `planCode` 仍按**旧码形**还原（material_x / bundle_x / svc_x / training_course_N），
   * 因为前端 `recordTitle`、`getOrderBusiness` 与既有响应契约都按码形判类型。
   */
  async listAllOrders(
    userId: number, status: string, limit: number, offset: number,
  ): Promise<{ total: number; list: NormalizedOrder[] }> {
    const statusParam = status && status !== "all" ? status : "";
    const [total, rows] = await Promise.all([
      this.paymentHistoryRepo.countOrders(userId, statusParam),
      this.paymentHistoryRepo.listOrders(userId, statusParam, limit, offset),
    ]);
    return { total, list: rows.map((row) => this.normalizeUnifiedOrder(row)) };
  }

  /** 统一订单行 → 对外 NormalizedOrder（业务类型与码形都由 product_kind 派生） */
  private normalizeUnifiedOrder(row: UnifiedOrderHistoryRow): NormalizedOrder {
    return {
      orderNo: row.order_no,
      userId: row.user_id ?? 0,
      businessType: BUSINESS_OF_KIND[row.product_kind] ?? "membership",
      provider: row.provider,
      planCode: legacyProductCode(row.product_kind, row.product_code),
      noticeId: null, // notice_id 列已随 009 退役，键位保留（命名红线②：对外契约不减键）
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      providerTradeNo: row.provider_trade_no,
      paidAt: row.paid_at ? new Date(row.paid_at as unknown as string).toISOString() : null,
      createdAt: new Date(row.created_at as unknown as string).toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at as unknown as string).toISOString() : null,
      expiresAt: row.expires_at ? new Date(row.expires_at as unknown as string).toISOString() : null,
    };
  }

}
