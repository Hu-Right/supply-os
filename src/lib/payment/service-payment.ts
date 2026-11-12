/**
 * 增值服务支付业务服务 — 一次性「服务」下单（不动会员核心）
 *
 * @module lib/payment/service-payment
 * @description 与 LearningPaymentService 对称：订单号前缀 SV，价格服务端权威读 service_catalog，
 *              复用同一 PaymentStrategy 出码；回调/mock 命中仅把 orders（kind='service'）标为 paid，
 *              不做额度/订阅发放（设计 B4）。表无 provider/trade_no/expiry 列 → 查询走 DB status。
 *              返回结构与 learning 下单一致，供 /api/payment/orders 路由统一后处理。
 *
 *              成交方式闸口（2026-09-28 对齐 260928 报价表）：sale_mode 是成交形态的唯一事实源
 *              —— 只有 'self' 能进自助支付；'lead'（留资）/'contract'（合同成交）一律拒绝下单并
 *              转预约顾问。此前只按「有无 standard_price」判定，使文档写「按需报价/定制报价/面议」
 *              的陪跑、KA、API 等也能被直接刷卡，既越权又把「起」价当成一口价。
 */
import crypto from "crypto";
import type { Pool } from "mysql2/promise";
import type { PaymentStrategy } from "./types";
import type { PaymentProviderName } from "../types/payment";
import type { ServiceOrdersRepo } from "../repos/service-orders.repo";
import { SITE_URL } from "../services/seo/site";
import { serviceProductOf, fetchServicePriceRow } from "./products";

/** 对外响应体（路由直接透出）：契约键 camelCase（红线②） */
export interface ServiceCreateOrderResult {
  orderNo: string;
  provider: PaymentProviderName;
  amount: number;
  currency: string;
  payUrl: string;
  qrCodeUrl?: string;
  status: "pending";
  createdAt: string;
}

export class ServicePaymentService {
  private getStrategyFn: ((provider: PaymentProviderName) => PaymentStrategy) | null = null;

  constructor(private ordersRepo: ServiceOrdersRepo, private pool: Pool) {}

  /** 注入策略解析器（由 Orchestrator.registerStrategy 调用）。 */
  setStrategyResolver(opts: { getStrategy: (provider: PaymentProviderName) => PaymentStrategy }): void {
    this.getStrategyFn = opts.getStrategy;
  }

  getStrategy(provider: PaymentProviderName): PaymentStrategy {
    if (!this.getStrategyFn) throw new Error("ServicePaymentService: strategy resolver not initialized");
    return this.getStrategyFn(provider);
  }

  /** 服务端权威定价：读目录校验在售且有固定价 → 出码 → 落 pending 单。 */
  async createOrder(params: {
    userId: number;
    serviceCode: string;
    provider: PaymentProviderName;
    returnUrl?: string;
    clientIp?: string;
  }): Promise<ServiceCreateOrderResult> {
    const { userId, serviceCode, provider } = params;

    // 取价与归一收口 lib/payment/products（原为内联 SQL + 本地 ServicePriceRow）
    const priceRow = await fetchServicePriceRow(this.pool, serviceCode);
    // 判定顺序与原实现一致：查无此服务/不可售 → 同一个错误码，之后才是「仅预约」
    if (!priceRow) throw new Error("SERVICE_UNAVAILABLE");
    const product = serviceProductOf(serviceCode, priceRow);
    if (!product.sellable) throw new Error("SERVICE_UNAVAILABLE");
    if (product.advisoryOnly) throw new Error("SERVICE_ADVISORY_ONLY");

    const amount = product.unitPrice;
    const orderNo = this.makeOrderNo();
    const strategy = this.getStrategy(provider);
    // return_url 同源白名单（对齐审查 F26）+ 拼 order_no；描述用人类可读品名
    const returnUrl = this.appendUrlParams(this.sanitizeReturnUrl(params.returnUrl || ""), { order_no: orderNo });
    const { pay_url, qr_code_url } = await strategy.createPaymentUrl(
      orderNo, amount, product.name, returnUrl, params.clientIp,
    );
    const currency = product.currency;

    await this.ordersRepo.createOrder({
      orderNo, userId, serviceCode,
      productName: product.name,
      unitPrice: product.priceRaw, amountTotal: product.priceRaw,
      currency, saleMode: product.saleMode ?? "",
    });

    return {
      // 对外响应体：契约键 camelCase（红线②）
      orderNo, provider, amount, currency,
      payUrl: pay_url, qrCodeUrl: qr_code_url, status: "pending", createdAt: new Date().toISOString(),
    };
  }

  /** 查询订单状态（读 DB，同培训分支；不落库渠道）。 */
  async queryOrder(orderNo: string): Promise<{
    orderNo: string; status: string; amount: number; currency: string; paidAt: string | null;
  } | null> {
    const st = await this.ordersRepo.queryStatus(orderNo);
    if (!st) return null;
    let status = st.status;
    let paidAt = st.paid_at;
    // mock 通道无异步回调：DB 仍 pending 时回查 mock 网关，命中则补标 paid（真实渠道靠 handleNotify 回写 DB）
    if (status === "pending") {
      try {
        const gw = await this.getStrategy("mock").queryOrderStatus(orderNo);
        if (gw.status === "paid") {
          await this.ordersRepo.markPaid(orderNo);
          status = "paid";
          paidAt = new Date();
        }
      } catch { /* mock 未注册或查询失败：以 DB 状态为准 */ }
    }
    return {
      orderNo, status, amount: Number(st.amount_total),
      currency: "CNY", paidAt: paidAt ? new Date(paidAt).toISOString() : null,
    };
  }

  /** 履约：仅标 paid（幂等），不做额度发放。 */
  async fulfillOrder(orderNo: string): Promise<void> {
    await this.ordersRepo.markPaid(orderNo);
  }

  async fulfillMockOrder(orderNo: string): Promise<{ found: boolean }> {
    const existing = await this.ordersRepo.findByOrderNo(orderNo);
    if (!existing) return { found: false };
    if (existing.status === "paid") return { found: true };
    await this.ordersRepo.markPaid(orderNo);
    return { found: true };
  }

  async reverseOrder(orderNo: string): Promise<{ found: boolean; reversed: boolean }> {
    const existing = await this.ordersRepo.findByOrderNo(orderNo);
    if (!existing) return { found: false, reversed: false };
    if (existing.status !== "paid") return { found: true, reversed: false };
    const reversed = await this.ordersRepo.markRefunded(orderNo);
    return { found: true, reversed };
  }

  private makeOrderNo(): string {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    return `SV${datePart}${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  }

  /** return_url 白名单（对齐 PaymentService F26）：仅同源，外域丢弃。 */
  private sanitizeReturnUrl(url: string): string {
    if (!url) return "";
    try {
      const parsed = new URL(url, SITE_URL);
      if (parsed.origin !== new URL(SITE_URL).origin) return "";
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return "";
    }
  }

  private appendUrlParams(url: string, params: Record<string, string | number>): string {
    if (!url) return "";
    const query = Object.entries(params)
      .filter(([, v]) => String(v) !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (!query) return url;
    return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
  }
}
