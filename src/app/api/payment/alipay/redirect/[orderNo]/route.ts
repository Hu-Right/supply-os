/**
 * GET /api/payment/alipay/redirect/:orderNo — 支付宝跳转 HTML 表单
 *
 * @module app/api/payment/alipay/redirect/[orderNo]/route
 * @description Alipay SDK pageExecute 返回自动提交的 HTML 表单，
 *              浏览器加载后自动 POST 到支付宝网关完成跳转。
 */
import { NextRequest } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> },
) {
  const { orderNo } = await params;
  const decodedOrderNo = decodeURIComponent(orderNo);

  const ctx = getContext();
  const order = await ctx.payment.paymentsRepo.findByOrderNo(decodedOrderNo);
  if (!order) return new Response("Order not found", { status: 404 });
  if (order.provider !== "alipay") return new Response("Not an Alipay order", { status: 400 });
  if (order.status !== "pending") return new Response("Order is not pending", { status: 400 });

  return new Response(order.pay_url!, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
