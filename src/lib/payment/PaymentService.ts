import "server-only";
import crypto from "crypto";
import type {
  CreateOrderRequest,
  OrderInfo,
  OrderStatusResult,
  PaymentProviderName,
} from "../types/payment";
import type { PaymentStrategy } from "./types";
import type { PaymentsRepo } from "../repos/payments.repo";
import { previewUpgrade } from "../services/membership-upgrade";
import type { BenefitFulfillDeps } from "./benefit-grant";
import { activatePaidOrder } from "./activate";
import { reverseFulfilledOrder } from "./reverse";
import { SITE_URL } from "../services/seo/site";
import { queryOrderWithGatewayPoll } from "./pipeline/query-pipeline";

/**
 * return_url 白名单（审查 F26）：仅接受本站相对路径或与 SITE_URL 同源的
 * 绝对地址（同源绝对地址规范化为相对路径）；外域一律丢弃。
 */
function sanitizeReturnUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url, SITE_URL);
    if (parsed.origin !== new URL(SITE_URL).origin) return "";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
}

export class PaymentService {
  /** 策略解析器（由 Orchestrator 注入） */
  private getStrategyFn: ((provider: PaymentProviderName) => PaymentStrategy) | null = null;
  private hasStrategyFn: ((provider: PaymentProviderName) => boolean) | null = null;

  constructor(private repo: PaymentsRepo, private benefitDeps: BenefitFulfillDeps) {}

  /**
   * 注入策略解析器（由 Orchestrator.registerStrategy 调用）
   * ARCH-PN（2026-09-11）：策略注册收归 Orchestrator 统一管理，
   * 子服务通过 resolver 延迟获取策略，不再各自维护 strategies Map。
   */
  setStrategyResolver(opts: {
    getStrategy: (provider: PaymentProviderName) => PaymentStrategy;
    hasStrategy: (provider: PaymentProviderName) => boolean;
  }): void {
    this.getStrategyFn = opts.getStrategy;
    this.hasStrategyFn = opts.hasStrategy;
  }

  /** 渠道是否已注册（config-status 等可用性判定的唯一依据） */
  hasStrategy(provider: PaymentProviderName): boolean {
    return this.hasStrategyFn?.(provider) ?? false;
  }

  getStrategy(provider: PaymentProviderName): PaymentStrategy {
    if (!this.getStrategyFn) throw new Error("PaymentService: strategy resolver not initialized");
    return this.getStrategyFn(provider);
  }

  /**
   * 创建支付订单（服务端权威定价）。
   *
   * 编排：学习类 plan_code 拒绝并委托 LearningPaymentService → 服务端定价
   * （金额一律取 DB/套餐配置，请求体 amount 不参与定价，审查 F2）→
   * 升级差价计算与快照（审查 F23）→ 生成订单号 + 渠道支付链接 + 落库（pending）。
   *
   * V2 权益（2026-09-21）：single_99 首单特惠与 annual_799 首单抵扣随旧套餐下架一并移除，
   * 新套餐体系（129/999/1299/8800）无促销规则。
   *
   * @throws UPGRADE_NOT_SUPPORTED / NO_ACTIVE_PLAN_TO_UPGRADE /
   *         ALREADY_ON_TARGET_PLAN / CANNOT_DOWNGRADE /
   *         FREE_PLAN_NO_PAYMENT_REQUIRED / LEARNING_ORDERS_DELEGATED
   */
  async createOrder(request: CreateOrderRequest): Promise<OrderInfo> {
    const userId = request.user_id;
    const planCode = String(request.plan_code || "").trim();
    const provider = request.provider;
    const noticeId = request.notice_id ? Number(request.notice_id) : null;
    const orderType = request.order_type === "upgrade" ? "upgrade" : "new";

    if (!userId || !planCode) throw new Error("USER_AND_PLAN_REQUIRED");

    // 学习资料/打包套餐：服务端权威定价（审查 F2）
    // 金额与套餐条目一律由服务端解析（material 查 DB 定价、bundle 查静态套餐配置），
    // 请求体中的 amount / bundle_items 不参与定价，仅作展示参考
    const isLearningOrder = planCode.startsWith("material_") || planCode.startsWith("bundle_");
    let amount: number;
    let planName: string;
    let currency: string;
    let originalOrderNo: string | null = null;
    let upgradeSnapshot: { subscription_id: number; target_plan_code: string; target_price: number; current_plan_code: string; current_price: number } | null = null;

    // ARCH-B+（2026-09-01）：学习资料 / 打包套餐订单已拆分至 learning_orders 表，
    // 由 LearningPaymentService 独立处理。此处拒绝学习类 plan_code。
    if (isLearningOrder) {
      throw new Error("LEARNING_ORDERS_DELEGATED");
    } else {
      const plan = await this.benefitDeps.catalog.getPlan(planCode);
      if (!plan) throw new Error("PLAN_NOT_FOUND");
      if (Number(plan.is_active) !== 1 || plan.price_mode !== "fixed") throw new Error("PLAN_NOT_SELLABLE");
      amount = Number(plan.price);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("AMOUNT_INVALID");
      planName = plan.name_zh;
      currency = plan.currency;

      // ── 升级订单：校验升级资格并计算差价 ──
      if (orderType === "upgrade") {
        const preview = await previewUpgrade(this.benefitDeps.catalog, userId, planCode);
        if (!preview.can_upgrade || !preview.subscription || !preview.current_plan) throw new Error(preview.reason ?? "UPGRADE_SOURCE_INVALID");
        const current = preview.current_plan;
        amount = preview.price_difference;
        originalOrderNo = preview.subscription.source_order_no;
        // 差价快照（审查 F23）：履约时校验目标套餐价与当前权益价未漂移，
        // 漂移则拒绝自动履约转人工
        upgradeSnapshot = {
          subscription_id: preview.subscription.subscription_id,
          target_plan_code: planCode,
          target_price: Number(plan.price),
          current_plan_code: current.plan_code,
          current_price: Number(current.price),
        };
      } else if (amount <= 0) {
        throw new Error("FREE_PLAN_NO_PAYMENT_REQUIRED");
      }
    }

    // 升级订单差价随使用量实时变化，不复用历史 pending 订单，始终新建
    const existingOrder = orderType === "upgrade"
      ? null
      : await this.repo.findPendingOrder({
          userId: userId!, planCode, provider, noticeId,
        });

    const strategy = this.getStrategy(provider);
    const orderNo = existingOrder?.order_no || this.makeOrderNo();
    // return_url 白名单（审查 F26）：仅接受本站地址，防止支付完成跳转任意
    // 站点并拼接 order_no/notice_id 参数钓鱼
    const returnUrl = this.appendUrlParams(sanitizeReturnUrl(request.return_url || ""), {
      order_no: orderNo,
      notice_id: noticeId || "",
    });
    const { pay_url, qr_code_url } = await strategy.createPaymentUrl(
      orderNo,
      amount,
      planName,
      returnUrl,
      request.client_ip,
    );

    // raw_request 记录服务端解析后的权威金额与套餐条目（履约以此为准）
    const rawRequestPayload = JSON.stringify({
      ...request,
      notice_id: noticeId,
      amount,
      ...(upgradeSnapshot ? { upgrade_snapshot: upgradeSnapshot } : {}),
    });

    if (existingOrder) {
      await this.repo.updatePendingOrder(orderNo, {
        amount,
        currency,
        payUrl: pay_url,
        qrCodeUrl: qr_code_url || null,
        rawRequest: rawRequestPayload,
      });
    } else {
      await this.repo.createOrder({
        userId: userId!,
        orderNo,
        provider,
        planCode,
        noticeId,
        amount,
        currency,
        payUrl: pay_url,
        qrCodeUrl: qr_code_url || null,
        rawRequest: rawRequestPayload,
        orderType,
        originalOrderNo,
      });
    }

    return {
      order_no: orderNo,
      provider,
      amount,
      currency,
      pay_url,
      qr_code_url,
      status: "pending",
      notice_id: noticeId,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * 查询订单状态（使用统一查询管道）。
   * ARCH-PN（2026-09-11）：委托 queryOrderWithGatewayPoll 管道，
   * 消除与 LearningPaymentService.queryOrder() 的重复逻辑。
   */
  async queryOrder(orderNo: string, providerTradeNo?: string): Promise<OrderStatusResult> {
    const result = await queryOrderWithGatewayPoll({
      findOrder: () => this.repo.findByOrderNo(orderNo),
      getStrategy: (p) => this.getStrategy(p),
      onFulfill: async (no, tradeNo) => { await activatePaidOrder(this.repo, no, tradeNo, this.benefitDeps); },
      orderNo,
      providerTradeNo,
    });
    return result as OrderStatusResult;
  }

  /**
   * 支付回调处理（Alipay notify 入口）。
   *
   * 分支顺序：
   * 1. 验签失败但 trade_status=TRADE_CLOSED → 退款/关闭路由（审查 F20，
   *    路由到 reverseFulfilledOrder 权益逆向，不得履约也不得丢弃）；
   * 2. 验签失败 → SIGN_VERIFY_FAILED；
   * 3. 回调金额校验（审查 P1-4）：缺失/0 拒绝，与 DB 订单金额偏差 > 0.01 拒绝；
   * 4. 未知订单拒绝（不再静默放行，防通知永久丢失）；
   * 5. 全部通过 → activatePaidOrder 履约激活（幂等）。
   *
   * @returns success=false 时附 reason message，支付平台据此决定是否重试
   */
  async handleNotify(
    provider: PaymentProviderName,
    rawBody: Record<string, unknown>,
    signature: string,
  ): Promise<{ success: boolean; order_no: string; message?: string }> {
    const strategy = this.getStrategy(provider);
    const verifyResult = await strategy.verifyCallback(rawBody, signature);
    // 退款/关闭通知路由（审查 F20）：签名有效但 trade_status=TRADE_CLOSED，
    // 不得履约也不得当作验签失败丢弃——路由到权益逆向回收
    if (!verifyResult.verified && verifyResult.tradeStatus === "TRADE_CLOSED") {
      if (!verifyResult.order_no) {
        return { success: false, order_no: "", message: "ORDER_NO_MISSING" };
      }
      const refundResult = await reverseFulfilledOrder(this.repo, verifyResult.order_no, this.benefitDeps);
      if (!refundResult.found) {
        return { success: false, order_no: verifyResult.order_no, message: "ORDER_NOT_FOUND" };
      }
      return {
        success: true,
        order_no: verifyResult.order_no,
        message: refundResult.review_required ? "REFUND_REVIEW_REQUIRED" : refundResult.reversed ? "REFUND_REVERSED" : "REFUND_NO_ACTION",
      };
    }
    if (!verifyResult.verified) {
      return { success: false, order_no: verifyResult.order_no, message: "SIGN_VERIFY_FAILED" };
    }
    if (!verifyResult.order_no) {
      return { success: false, order_no: "", message: "ORDER_NO_MISSING" };
    }

    // P1-4 安全修复：回调金额必须校验，amount 为 0 或缺失时直接拒绝
    // 防止伪造 body 不带 total_amount 跳过金额比对
    const callbackAmount = Number(verifyResult.amount || 0);
    if (callbackAmount <= 0) {
      console.warn(`[PaymentService] 回调金额无效: amount=${callbackAmount}, order_no=${verifyResult.order_no}`);
      return { success: false, order_no: verifyResult.order_no, message: "AMOUNT_INVALID" };
    }
    {
      const dbOrder = await this.repo.findOrderAmount(verifyResult.order_no);
      if (!dbOrder) {
        // 未知订单拒绝：跨环境误投/伪造 order_no 不再静默放行（原实现跳过校验并回 success，
        // 导致平台停止重试、通知永久丢失）
        console.warn(`[PaymentService] 订单不存在: order_no=${verifyResult.order_no}`);
        return { success: false, order_no: verifyResult.order_no, message: "ORDER_NOT_FOUND" };
      }
      const orderAmount = dbOrder.amount;
      if (orderAmount > 0 && Math.abs(orderAmount - callbackAmount) > 0.01) {
        console.warn(
          `[PaymentService] 金额不匹配: order=${orderAmount}, callback=${callbackAmount}, order_no=${verifyResult.order_no}`,
        );
        return { success: false, order_no: verifyResult.order_no, message: "AMOUNT_MISMATCH" };
      }
    }

    await activatePaidOrder(this.repo, verifyResult.order_no, verifyResult.provider_trade_no, this.benefitDeps);
    return { success: true, order_no: verifyResult.order_no };
  }

  private makeOrderNo(): string {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    return `SO${datePart}${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  }

  private appendUrlParams(url: string, params: Record<string, string | number>): string {
    if (!url) return "";
    const query = Object.entries(params)
      .filter(([, value]) => String(value) !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    if (!query) return url;

    if (url.includes("#")) {
      const hashIdx = url.indexOf("#");
      const beforeHash = url.slice(0, hashIdx);
      const hash = url.slice(hashIdx + 1);
      return `${beforeHash}${beforeHash.includes("?") ? "&" : "?"}${query}#${hash}`;
    }
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
  }

  /**
   * Mock 支付履约（会员订单）
   * ARCH-B+（2026-09-01）：供 Orchestrator 路由调用
   */
  async fulfillMockMembershipOrder(orderNo: string, rawNotify: string): Promise<boolean> {
    return activatePaidOrder(this.repo, orderNo, undefined, this.benefitDeps, rawNotify);
  }

}
