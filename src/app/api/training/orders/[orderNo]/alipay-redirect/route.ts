/**
 * GET /api/training/orders/:orderNo/alipay-redirect — 支付宝跳转 HTML 表单
 */
import { NextRequest } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";

export const GET = withRoute<{ params: Promise<{ orderNo: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { orderNo } = await params;
    const ctx = getContext();
    const order = await ctx.trainingRepo.findOrderByNo(orderNo);
    if (!order) routeError(404, 40404, "Order not found");
    if (order.user_id && order.user_id !== auth.userId) routeError(403, 40003, "Forbidden");
    if (order.provider !== "alipay") routeError(400, 40000, "Not an Alipay order");
    if (order.status !== "pending") routeError(400, 40000, "Order is not pending");
    if (!order.pay_url) routeError(400, 40000, "Payment url missing");

    return new Response(order.pay_url, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
);
