/**
 * POST /api/training/orders/:orderNo/mock-paid — Mock 支付履约
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { fulfillTrainingOrder } from "@/lib/services/training-payment";

const ApiErrorCode = {
  TRAINING_ORDER_NOT_FOUND: 40406,
  TRAINING_ORDER_FORBIDDEN: 40303,
} as const;

function sendError(message: string, status: number, code: number) {
  return NextResponse.json({ code, message, error: message }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> },
) {
  const ctx = getContext();
  if (ctx.payment.paymentMode === "live") {
    return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
  }

  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { orderNo } = await params;
  const trainingRepo = ctx.trainingRepo;

  const order = await trainingRepo.findOrderByNo(orderNo);
  if (!order) return sendError("订单不存在", 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND);
  if (order.user_key !== auth.userKey) return sendError("无权操作此订单", 403, ApiErrorCode.TRAINING_ORDER_FORBIDDEN);

  await fulfillTrainingOrder(trainingRepo as any, orderNo, `MOCK-${orderNo}`);
  return NextResponse.json({ success: true, order_no: orderNo, status: "paid" });
}
