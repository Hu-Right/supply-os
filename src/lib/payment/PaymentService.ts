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
import type { MembershipRepo } from "../repos/membership.repo";
import type { LearningMaterialsRepo } from "../repos/learning-materials.repo";
import { findLearningBundle } from "../data/learning-bundles";
import { MockProvider } from "./MockProvider";
import { AlipayProvider } from "./AlipayProvider";
import { WechatProvider } from "./WechatProvider";
import { activatePaidOrder, reverseFulfilledOrder } from "./fulfillment";
import { isParseablePrivateKey } from "./keys";
import { SITE_URL } from "../services/seo/site";

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
  private strategies: Map<PaymentProviderName, PaymentStrategy> = new Map();

  constructor(
    private paymentsRepo?: PaymentsRepo,
    private membershipRepo?: MembershipRepo,
    private learningMaterialsRepo?: LearningMaterialsRepo,
  ) {}

  /** 获取 paymentsRepo（未初始化时抛出明确错误） */
  private get repo(): PaymentsRepo {
    if (!this.paymentsRepo) {
      throw new Error("PaymentService: paymentsRepo is required for this operation");
    }
    return this.paymentsRepo;
  }

  registerStrategy(provider: PaymentProviderName, strategy: PaymentStrategy): void {
    this.strategies.set(provider, strategy);
  }

  /** 渠道是否已注册（config-status 等可用性判定的唯一依据） */
  hasStrategy(provider: PaymentProviderName): boolean {
    return this.strategies.has(provider);
  }

  getStrategy(provider: PaymentProviderName): PaymentStrategy {
    const strategy = this.strategies.get(provider);
    if (!strategy) throw new Error(`Unsupported payment provider: ${provider}`);
    return strategy;
  }

  async createOrder(request: CreateOrderRequest): Promise<OrderInfo> {
    const userKey = String(request.user_key || "").trim().toLowerCase().slice(0, 190);
    const planCode = String(request.plan_code || "").trim();
    const provider = request.provider;
    const noticeId = request.notice_id ? Number(request.notice_id) : null;
    const orderType = request.order_type === "upgrade" ? "upgrade" : "new";

    if (!userKey || !planCode) throw new Error("USER_AND_PLAN_REQUIRED");

    // 学习资料/打包套餐：服务端权威定价（审查 F2）
    // 金额与套餐条目一律由服务端解析（material 查 DB 定价、bundle 查静态套餐配置），
    // 请求体中的 amount / bundle_items 不参与定价，仅作展示参考
    const isLearningOrder = planCode.startsWith("material_") || planCode.startsWith("bundle_");
    let amount: number;
    let planName = planCode;
    let currency = "CNY";
    let originalOrderNo: string | null = null;
    let bundleItems: string[] | null = null;
    let upgradeSnapshot: { target_plan_code: string; target_price: number; current_plan_code: string; current_price: number } | null = null;
    let deductionSnapshot: { source_order_no: string; source_amount: number; base_price: number } | null = null;

    if (isLearningOrder) {
      if (planCode.startsWith("material_")) {
        const materialId = planCode.slice("material_".length);
        const material = await this.learningMaterialsRepo?.findByMaterialId(materialId);
        if (!material) throw new Error("MATERIAL_NOT_FOUND");
        amount = Number(material.price);
        planName = material.title_zh || material.title_en || planCode;
      } else {
        const bundle = findLearningBundle(planCode.slice("bundle_".length));
        if (!bundle) throw new Error("BUNDLE_NOT_FOUND");
        amount = bundle.price;
        planName = bundle.labelZh;
        bundleItems = [...bundle.includesIds];
      }
      if (amount <= 0) throw new Error("INVALID_AMOUNT");
    } else {
      const plan = await this.repo.findActivePlan(planCode);
      if (!plan) throw new Error("PLAN_NOT_FOUND");
      amount = Number(plan.price);
      planName = String(plan.name || planCode);
      currency = plan.currency || "CNY";

      // ── 首单特惠资格（single_99，2026-08-30）──
      // 曾购/持有任何 single_% 订单（含 pending，防并发开单绕过）即拒绝
      if (planCode === "single_99") {
        const hasRecord = await this.repo.hasSingleUnlockRecord(userKey);
        if (hasRecord) throw new Error("SINGLE_FIRST_PURCHASE_ONLY");
      }

      // ── 升级订单：校验升级资格并计算差价 ──
      if (orderType === "upgrade") {
        if (!this.membershipRepo) throw new Error("UPGRADE_NOT_SUPPORTED");
        const current = await this.membershipRepo.findCurrentBestPlan(userKey);
        if (!current) throw new Error("NO_ACTIVE_PLAN_TO_UPGRADE");
        if (current.plan_code === planCode) throw new Error("ALREADY_ON_TARGET_PLAN");
        if (Number(plan.price) <= Number(current.price)) throw new Error("CANNOT_DOWNGRADE");
        amount = Math.max(0, Number(plan.price) - Number(current.price));
        originalOrderNo = current.source_order_no;
        if (amount <= 0) throw new Error("FREE_PLAN_NO_PAYMENT_REQUIRED");
        // 差价快照（审查 F23）：履约时校验目标套餐价与当前权益价未漂移，
        // 漂移则拒绝自动履约转人工
        upgradeSnapshot = {
          target_plan_code: planCode,
          target_price: Number(plan.price),
          current_plan_code: current.plan_code,
          current_price: Number(current.price),
        };
      } else if (amount <= 0) {
        throw new Error("FREE_PLAN_NO_PAYMENT_REQUIRED");
      }

      // ── 首单抵扣（2026-08-30 产品决策）：购标讯个人会员时，7 天内已支付的
      // single_99 订单金额自动抵扣（799-99=700）。快照锁价与升级差价同哲学：
      // 下单那一刻确定抵扣，履约期不重算（第 7 天 23:59 下单仍享）。
      // 决策 1：仅 single_99 源可抵扣，历史 single_199 买家不参与。
      if (planCode === "annual_799" && orderType === "new") {
        const source = await this.repo.findDeductibleSingleOrder(userKey);
        if (source && source.amount > 0) {
          amount = Math.max(0, amount - source.amount);
          originalOrderNo = source.order_no;
          deductionSnapshot = {
            source_order_no: source.order_no,
            source_amount: source.amount,
            base_price: Number(plan.price),
          };
        }
      }
    }

    // 升级订单差价随使用量实时变化，不复用历史 pending 订单，始终新建；
    // annual_799 抵扣单同理（抵扣窗口/资格在下单时判定，复用旧 pending 会把
    // 带抵扣与不带抵扣的单据互相覆盖）；single_99 首单资格同样按当次判定
    const isPromotionalOrder = planCode === "annual_799" || planCode === "single_99";
    const existingOrder = orderType === "upgrade" || isLearningOrder || isPromotionalOrder
      ? null
      : await this.repo.findPendingOrder({
          userKey, planCode, provider, noticeId,
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
      user_key: userKey,
      notice_id: noticeId,
      amount,
      ...(bundleItems ? { bundle_items: bundleItems } : {}),
      ...(upgradeSnapshot ? { upgrade_snapshot: upgradeSnapshot } : {}),
      ...(deductionSnapshot ? { deduction: deductionSnapshot } : {}),
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
        userKey,
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

  async queryOrder(orderNo: string, providerTradeNo?: string): Promise<OrderStatusResult> {
    const dbOrder = await this.repo.findByOrderNo(orderNo);
    if (!dbOrder) return { order_no: orderNo, status: "closed" };

    if (dbOrder.status === "pending" && dbOrder.provider) {
      try {
        const strategy = this.getStrategy(dbOrder.provider as PaymentProviderName);
        const result = await strategy.queryOrderStatus(orderNo, providerTradeNo);
        if (result.status === "paid") {
          await this.activatePaidOrder(orderNo, result.provider_trade_no);
          return {
            ...result,
            order_no: orderNo,
            provider: dbOrder.provider as PaymentProviderName,
            plan_code: dbOrder.plan_code,
            amount: Number(dbOrder.amount || 0),
            currency: dbOrder.currency || "CNY",
            notice_id: dbOrder.notice_id || null,
          };
        }
        if (result.status !== "pending") {
          return {
            ...result,
            order_no: orderNo,
            provider: dbOrder.provider as PaymentProviderName,
            plan_code: dbOrder.plan_code,
            amount: Number(dbOrder.amount || 0),
            currency: dbOrder.currency || "CNY",
            notice_id: dbOrder.notice_id || null,
          };
        }
      } catch {
        // Keep the database status when provider polling is unavailable.
      }
    }

    return {
      order_no: dbOrder.order_no,
      status: dbOrder.status as import("../types/payment").PaymentOrderStatus,
      notice_id: dbOrder.notice_id || null,
      provider: dbOrder.provider as PaymentProviderName,
      plan_code: dbOrder.plan_code,
      amount: Number(dbOrder.amount || 0),
      currency: dbOrder.currency || "CNY",
      provider_trade_no: dbOrder.provider_trade_no || undefined,
      paid_at: dbOrder.paid_at ? new Date(dbOrder.paid_at).toISOString() : undefined,
    };
  }

  async handleNotify(
    provider: PaymentProviderName,
    rawBody: any,
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
      const refundResult = await reverseFulfilledOrder(this.repo, verifyResult.order_no);
      if (!refundResult.found) {
        return { success: false, order_no: verifyResult.order_no, message: "ORDER_NOT_FOUND" };
      }
      return {
        success: true,
        order_no: verifyResult.order_no,
        message: refundResult.reversed ? "REFUND_REVERSED" : "REFUND_NO_ACTION",
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

    await this.activatePaidOrder(verifyResult.order_no, verifyResult.provider_trade_no);
    return { success: true, order_no: verifyResult.order_no };
  }

  /** 激活已支付订单（委托至 fulfillment 模块） */
  private async activatePaidOrder(orderNo: string, providerTradeNo?: string): Promise<void> {
    return activatePaidOrder(this.repo, orderNo, providerTradeNo);
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

  static initDefault(paymentsRepo: PaymentsRepo, paymentMode: "mock" | "live" = "mock", membershipRepo?: MembershipRepo, learningMaterialsRepo?: LearningMaterialsRepo): PaymentService {
    const service = new PaymentService(paymentsRepo, membershipRepo, learningMaterialsRepo);
    service.registerStrategy("mock", new MockProvider());

    if (paymentMode === "live") {
      const alipayAppId = process.env.ALIPAY_APP_ID || "";
      const alipayPrivateKey = process.env.ALIPAY_PRIVATE_KEY || "";
      // 密钥可解析才注册：占位符/示例值视为未开通，避免下单时才在签名环节失败
      if (alipayAppId && isParseablePrivateKey(alipayPrivateKey)) {
        service.registerStrategy(
          "alipay",
          new AlipayProvider({
            appId: alipayAppId,
            privateKey: alipayPrivateKey,
            publicKey: process.env.ALIPAY_PUBLIC_KEY || "",
            notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
            sandbox: process.env.ALIPAY_SANDBOX === "true",
          }),
        );
      } else if (alipayAppId) {
        console.warn("[PaymentService] 支付宝私钥无法解析（占位符或格式错误），alipay 渠道未注册");
      }

      const wechatAppId = process.env.WECHAT_APP_ID || "";
      const wechatMchId = process.env.WECHAT_MCH_ID || process.env.WECHAT_MERCHANT_ID || "";
      if (wechatAppId && wechatMchId) {
        service.registerStrategy(
          "wechat",
          new WechatProvider({
            appId: wechatAppId,
            mchId: wechatMchId,
            apiV3Key: process.env.WECHAT_API_V3_KEY || "",
            privateKey: process.env.WECHAT_PRIVATE_KEY || "",
            notifyUrl: process.env.WECHAT_NOTIFY_URL || "",
            sandbox: false,
          }),
        );
      }
    }

    return service;
  }
}
