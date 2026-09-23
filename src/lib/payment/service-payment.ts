/**
 * 增值服务支付业务服务 — 一次性「服务」下单（不动会员核心）
 *
 * @module lib/payment/service-payment
 * @description 与 LearningPaymentService 对称：订单号前缀 SV，价格服务端权威读 crm_service_catalog，
 *              复用同一 PaymentStrategy 出码；回调/mock 命中仅把 crm_service_orders 标为 paid，
 *              不做额度/订阅发放（设计 B4）。表无 provider/trade_no/expiry 列 → 查询走 DB status。
 *              返回结构与 learning 下单一致，供 /api/payment/orders 路由统一后处理。
 */
import crypto from "crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { PaymentStrategy } from "./types";
import type { PaymentProviderName } from "../types/payment";
import type { ServiceOrdersRepo } from "../repos/service-orders.repo";

export interface ServiceCreateOrderResult {
  order_no: string;
  provider: PaymentProviderName;
  amount: number;
  currency: string;
  pay_url: string;
  qr_code_url?: string;
  status: "pending";
  created_at: string;
}

interface ServicePriceRow {
  standard_price: string | null;
  currency: string;
  sale_mode: string;
  is_active: number;
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

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT standard_price, currency, sale_mode, is_active
         FROM crm_service_catalog WHERE service_code = ? LIMIT 1`,
      [serviceCode],
    );
    const svc = rows[0] as ServicePriceRow | undefined;
    if (!svc || svc.is_active !== 1 || svc.standard_price === null || Number(svc.standard_price) <= 0) {
      throw new Error("SERVICE_UNAVAILABLE");
    }

    const amount = Number(svc.standard_price);
    const orderNo = this.makeOrderNo();
    const strategy = this.getStrategy(provider);
    const { pay_url, qr_code_url } = await strategy.createPaymentUrl(
      orderNo, amount, `service_${serviceCode}`, params.returnUrl || "", params.clientIp,
    );
    const currency = svc.currency || "CNY";

    await this.ordersRepo.createOrder({
      orderNo, userId, serviceCode,
      unitPrice: String(svc.standard_price), amountTotal: String(svc.standard_price),
      currency, saleMode: svc.sale_mode,
    });

    return {
      order_no: orderNo, provider, amount, currency,
      pay_url, qr_code_url, status: "pending", created_at: new Date().toISOString(),
    };
  }

  /** 查询订单状态（读 DB，同培训分支；不落库渠道）。 */
  async queryOrder(orderNo: string): Promise<{
    order_no: string; status: string; amount: number; currency: string; paid_at: string | null;
  } | null> {
    const st = await this.ordersRepo.queryStatus(orderNo);
    if (!st) return null;
    return {
      order_no: orderNo, status: st.status, amount: Number(st.amount_total),
      currency: "CNY", paid_at: st.paid_at ? new Date(st.paid_at).toISOString() : null,
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
}
