/**
 * 支付相关 API 调用
 * Payment API Calls
 *
 * @module features/payment/api
 * @description 封装支付订单创建和状态查询的网络请求
 *              Encapsulates payment order creation and status polling requests
 */

export type OrderInfo = {
  order_no: string;
  pay_url: string;
  qr_code_url?: string;
  provider: "alipay" | "wechat" | "mock";
  status: "pending" | "paid" | "closed" | "failed";
};

export type CreateOrderParams = {
  userKey: string;
  planCode: string;
  provider: "alipay" | "wechat" | "mock";
};

/**
 * 创建支付订单
 * Create payment order
 */
export async function createOrder(params: CreateOrderParams): Promise<OrderInfo> {
  const res = await fetch("/api/payment/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_key: params.userKey,
      plan_code: params.planCode,
      provider: params.provider,
      return_url: window.location.origin + window.location.pathname,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "创建订单失败");
  }

  return res.json();
}

/**
 * 查询订单状态
 * Query order status
 */
export async function getOrderStatus(orderNo: string): Promise<OrderInfo> {
  const res = await fetch(`/api/payment/orders/${orderNo}`);
  if (!res.ok) throw new Error("查询订单失败");
  return res.json();
}
