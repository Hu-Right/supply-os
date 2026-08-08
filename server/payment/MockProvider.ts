import crypto from "crypto";
import type { PaymentOrderStatus } from "../../src/types/payment";
import type { PaymentStrategy } from "./types";

/**
 * Mock 支付策略 —— 开发环境模拟支付，无需真实支付宝/微信账号
 * - 创建订单后 5 秒自动变为 paid 状态（模拟异步回调）
 * - 查询订单状态模拟轮询
 */
export class MockProvider implements PaymentStrategy {
  readonly name = "mock" as const;

  // 模拟存储（服务重启会丢失，仅用于开发演示）
  private mockOrders = new Map<
    string,
    { status: PaymentOrderStatus; provider_trade_no: string; amount: number; paid_at?: string }
  >();

  async createPaymentUrl(
    orderNo: string,
    amount: number,
    description: string,
    _returnUrl?: string,
    _clientIp?: string,
  ): Promise<{ pay_url: string; qr_code_url?: string }> {
    const tradeNo = `MOCK_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    this.mockOrders.set(orderNo, {
      status: "pending",
      provider_trade_no: tradeNo,
      amount,
    });

    // 5 秒后自动变为 paid（模拟支付回调）
    setTimeout(() => {
      const order = this.mockOrders.get(orderNo);
      if (order && order.status === "pending") {
        order.status = "paid";
        order.paid_at = new Date().toISOString();
        console.log(`[MockProvider] 订单 ${orderNo} 自动支付成功 (mock)`);
      }
    }, 5000);

    // 返回一个假的支付页面 URL（实际上前端可以直接轮询等待自动变 paid）
    return {
      pay_url: `/mock-payment?order_no=${orderNo}&amount=${amount}&desc=${encodeURIComponent(description)}`,
      qr_code_url: undefined,
    };
  }

  async verifyCallback(
    _rawBody: any,
    _signature: string,
  ): Promise<{
    verified: boolean;
    order_no: string;
    provider_trade_no: string;
    amount: number;
  }> {
    // Mock 模式下不需要验签，直接返回成功
    return {
      verified: true,
      order_no: "mock_order",
      provider_trade_no: `MOCK_TRADE_${Date.now()}`,
      amount: 0,
    };
  }

  async queryOrderStatus(orderNo: string): Promise<{
    status: PaymentOrderStatus;
    provider_trade_no?: string;
  }> {
    const order = this.mockOrders.get(orderNo);
    if (!order) {
      return { status: "closed" };
    }
    return {
      status: order.status,
      provider_trade_no: order.provider_trade_no,
    };
  }
}
