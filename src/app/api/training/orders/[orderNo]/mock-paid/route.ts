/**
 * POST /api/training/orders/:orderNo/mock-paid — Mock 支付履约
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { fulfillTrainingOrder } from "@/lib/services/training-payment";
import { EC_TRAINING_ORDER_NOT_FOUND, EC_TRAINING_ORDER_FORBIDDEN } from "@/shared/constants/api";

export const POST = withRoute<{ params: Promise<{ orderNo: string }> }>(
  async (req, { params }) => {
    const ctx = getContext();
    if (ctx.payment.paymentMode === "live") {
      routeError(404, 40404, "订单不存在");
    }

    const auth = await requireUserKeyOrThrow(req);

    const { orderNo } = await params;
    const trainingRepo = ctx.trainingRepo;

    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) routeError(404, EC_TRAINING_ORDER_NOT_FOUND, "订单不存在");
    if (order.user_id && order.user_id !== auth.userId) routeError(403, EC_TRAINING_ORDER_FORBIDDEN, "无权操作此订单");

    await fulfillTrainingOrder(trainingRepo as any, orderNo, `MOCK-${orderNo}`);
    return NextResponse.json({ success: true, order_no: orderNo, status: "paid" });
  },
);
