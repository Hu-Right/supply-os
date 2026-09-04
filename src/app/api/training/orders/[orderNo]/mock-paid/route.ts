/**
 * POST /api/training/orders/:orderNo/mock-paid — Mock 支付履约
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { fulfillTrainingOrder } from "@/lib/services/training-payment";
import { EC_TRAINING_ORDER_NOT_FOUND, EC_TRAINING_ORDER_FORBIDDEN } from "@/shared/constants/api";

function sendError(message: string, status: number, code: number) {
  return NextResponse.json({ code, message, error: message }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> },
) {
  const ctx = getContext();
  if (ctx.payment.paymentMode === "live") {
    return NextResponse.json({ code: 40404, message: "订单不存在" }, { status: 404 });
  }

  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { orderNo } = await params;
  const trainingRepo = ctx.trainingRepo;

  const order = await trainingRepo.findOrderByNo(orderNo);
  if (!order) return sendError("订单不存在", 404, EC_TRAINING_ORDER_NOT_FOUND);
  if (order.user_id && order.user_id !== auth.userId) return sendError("无权操作此订单", 403, EC_TRAINING_ORDER_FORBIDDEN);

  await fulfillTrainingOrder(trainingRepo as any, orderNo, `MOCK-${orderNo}`);
  return NextResponse.json({ success: true, order_no: orderNo, status: "paid" });
}
