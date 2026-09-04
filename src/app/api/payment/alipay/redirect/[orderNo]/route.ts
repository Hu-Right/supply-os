/**
 * GET /api/payment/alipay/redirect/:orderNo — 支付宝跳转 HTML 表单
 *
 * @module app/api/payment/alipay/redirect/[orderNo]/route
 * @description Alipay SDK pageExecute 返回自动提交的 HTML 表单，
 *              浏览器加载后自动 POST 到支付宝网关完成跳转。
 */
import { NextRequest } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";

export const GET = withRoute<{ params: Promise<{ orderNo: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { orderNo } = await params;
    const decodedOrderNo = decodeURIComponent(orderNo);

    const ctx = getContext();
    const order = await ctx.payment.paymentsRepo.findByOrderNo(decodedOrderNo);
    if (!order) routeError(404, 40404, "Order not found");
    if (order.user_id !== auth.userId) routeError(403, 40003, "Forbidden");
    if (order.provider !== "alipay") routeError(400, 40000, "Not an Alipay order");
    if (order.status !== "pending") routeError(400, 40000, "Order is not pending");

    return new Response(order.pay_url!, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
);
