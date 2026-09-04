/**
 * GET /api/payment/orders/:orderNo — 查询订单状态
 *
 * @module app/api/payment/orders/[orderNo]/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_PAYMENT_ORDER_NOT_FOUND, EC_ACCESS_FORBIDDEN } from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ orderNo: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { orderNo } = await params;
    const decodedOrderNo = decodeURIComponent(orderNo);

    const url = req.nextUrl;
    const ctx = getContext();
    const { orchestrator } = ctx.payment;

    // ARCH-B+（2026-09-01）：通过 Orchestrator 按订单号前缀路由查询
    const order = await orchestrator.findOrder(decodedOrderNo);
    if (!order) routeError(404, EC_PAYMENT_ORDER_NOT_FOUND, "订单不存在");
    if (order.user_id !== auth.userId) routeError(403, EC_ACCESS_FORBIDDEN, "无权操作");

    const tradeNo = url.searchParams.get("trade_no") || "";
    const result = await orchestrator.queryOrder(decodedOrderNo, tradeNo);
    return NextResponse.json(result);
  },
);
