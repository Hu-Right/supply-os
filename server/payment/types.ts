/**
 * 支付策略接口（后端专用）
 * Payment Strategy Interface (backend only)
 *
 * @module server/payment/types
 * @description 支付渠道策略的统一接口定义，供 PaymentService 和各 Provider 实现
 */
import type { PaymentProviderName, PaymentOrderStatus } from "../../src/types/payment";

export interface PaymentStrategy {
  readonly name: PaymentProviderName;
  createPaymentUrl(
    orderNo: string,
    amount: number,
    description: string,
    returnUrl?: string,
    clientIp?: string,
  ): Promise<{
    pay_url: string;
    qr_code_url?: string;
  }>;
  verifyCallback(rawBody: any, signature: string): Promise<{
    verified: boolean;
    order_no: string;
    provider_trade_no: string;
    amount: number;
  }>;
  queryOrderStatus(orderNo: string, providerTradeNo?: string): Promise<{
    status: PaymentOrderStatus;
    provider_trade_no?: string;
  }>;
}
