/**
 * POST /api/payments/:orderNo/mock-paid — Mock 支付履约（仅 mock 模式）
 *
 * ARCH-B+（2026-09-01）：通过 Orchestrator 按订单号前缀路由至对应业务服务。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_PAYMENT_ORDER_NOT_FOUND, EC_ACCESS_FORBIDDEN } from "@/shared/constants/api";

export const POST = withRoute<{ params: Promise<{ orderNo: string }> }>(
  async (req, { params }) => {
    const ctx = getContext();
    if (ctx.payment.paymentMode === "live") {
      routeError(404, 40404, "订单不存在");
    }

    const auth = await requireUserKeyOrThrow(req);

    const { orderNo } = await params;
    const { orchestrator } = ctx.payment;

    const dbOrder = await orchestrator.findOrder(orderNo);
    if (!dbOrder) routeError(404, EC_PAYMENT_ORDER_NOT_FOUND, "订单不存在");
    if (dbOrder.user_id !== auth.userId) routeError(403, EC_ACCESS_FORBIDDEN, "无权操作此订单");

    const body = await req.json().catch(() => ({}));
    const { found } = await orchestrator.fulfillMockOrder(
      orderNo, JSON.stringify(body || { mock: true }),
    );
    if (!found) routeError(404, EC_PAYMENT_ORDER_NOT_FOUND, "订单不存在");

    return NextResponse.json({ success: true, order_no: orderNo, status: "paid" });
  },
);
