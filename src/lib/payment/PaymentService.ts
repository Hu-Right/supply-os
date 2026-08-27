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
import { MockProvider } from "./MockProvider";
import { AlipayProvider } from "./AlipayProvider";
import { WechatProvider } from "./WechatProvider";
import { activatePaidOrder } from "./fulfillment";
import { isParseablePrivateKey } from "./keys";

export class PaymentService {
  private strategies: Map<PaymentProviderName, PaymentStrategy> = new Map();

  constructor(private paymentsRepo?: PaymentsRepo, private membershipRepo?: MembershipRepo) {}

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

    const plan = await this.paymentsRepo!.findActivePlan(planCode);
    if (!plan) throw new Error("PLAN_NOT_FOUND");

    // ── 升级订单：校验升级资格并计算差价 ──
    let amount = Number(plan.price);
    let originalOrderNo: string | null = null;
    if (orderType === "upgrade") {
      if (!this.membershipRepo) throw new Error("UPGRADE_NOT_SUPPORTED");
      const current = await this.membershipRepo.findCurrentBestPlan(userKey);
      if (!current) throw new Error("NO_ACTIVE_PLAN_TO_UPGRADE");
      if (current.plan_code === planCode) throw new Error("ALREADY_ON_TARGET_PLAN");
      if (Number(plan.price) <= Number(current.price)) throw new Error("CANNOT_DOWNGRADE");
      amount = Math.max(0, Number(plan.price) - Number(current.price));
      originalOrderNo = current.source_order_no;
      if (amount <= 0) throw new Error("FREE_PLAN_NO_PAYMENT_REQUIRED");
    } else if (amount <= 0) {
      throw new Error("FREE_PLAN_NO_PAYMENT_REQUIRED");
    }

    // 升级订单差价随使用量实时变化，不复用历史 pending 订单，始终新建
    const existingOrder = orderType === "upgrade"
      ? null
      : await this.paymentsRepo!.findPendingOrder({
          userKey, planCode, provider, noticeId,
        });

    const strategy = this.getStrategy(provider);
    const orderNo = existingOrder?.order_no || this.makeOrderNo();
    const returnUrl = this.appendUrlParams(request.return_url || "", {
      order_no: orderNo,
      notice_id: noticeId || "",
    });
    const { pay_url, qr_code_url } = await strategy.createPaymentUrl(
      orderNo,
      amount,
      String(plan.name || planCode),
      returnUrl,
      request.client_ip,
    );

    if (existingOrder) {
      await this.paymentsRepo!.updatePendingOrder(orderNo, {
        amount,
        currency: plan.currency || "CNY",
        payUrl: pay_url,
        qrCodeUrl: qr_code_url || null,
        rawRequest: JSON.stringify({ ...request, user_key: userKey, notice_id: noticeId }),
      });
    } else {
      await this.paymentsRepo!.createOrder({
        userKey,
        orderNo,
        provider,
        planCode,
        noticeId,
        amount,
        currency: plan.currency || "CNY",
        payUrl: pay_url,
        qrCodeUrl: qr_code_url || null,
        rawRequest: JSON.stringify({ ...request, user_key: userKey, notice_id: noticeId }),
        orderType,
        originalOrderNo,
      });
    }

    return {
      order_no: orderNo,
      provider,
      amount,
      currency: plan.currency || "CNY",
      pay_url,
      qr_code_url,
      status: "pending",
      notice_id: noticeId,
      created_at: new Date().toISOString(),
    };
  }

  async queryOrder(orderNo: string, providerTradeNo?: string): Promise<OrderStatusResult> {
    const dbOrder = await this.paymentsRepo!.findByOrderNo(orderNo);
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
      const dbOrder = await this.paymentsRepo!.findOrderAmount(verifyResult.order_no);
      if (dbOrder) {
        const orderAmount = dbOrder.amount;
        if (orderAmount > 0 && Math.abs(orderAmount - callbackAmount) > 0.01) {
          console.warn(
            `[PaymentService] 金额不匹配: order=${orderAmount}, callback=${callbackAmount}, order_no=${verifyResult.order_no}`,
          );
          return { success: false, order_no: verifyResult.order_no, message: "AMOUNT_MISMATCH" };
        }
      }
    }

    await this.activatePaidOrder(verifyResult.order_no, verifyResult.provider_trade_no);
    return { success: true, order_no: verifyResult.order_no };
  }

  /** 激活已支付订单（委托至 fulfillment 模块） */
  private async activatePaidOrder(orderNo: string, providerTradeNo?: string): Promise<void> {
    return activatePaidOrder(this.paymentsRepo!, orderNo, providerTradeNo);
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

  static initDefault(paymentsRepo: PaymentsRepo, paymentMode: "mock" | "live" = "mock", membershipRepo?: MembershipRepo): PaymentService {
    const service = new PaymentService(paymentsRepo, membershipRepo);
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
