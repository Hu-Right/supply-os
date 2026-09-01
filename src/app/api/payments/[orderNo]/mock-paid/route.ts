/**
 * POST /api/payments/:orderNo/mock-paid — Mock 支付履约（仅 mock 模式）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { fulfillMockPayment } from "@/lib/payment/fulfillment";

const ApiErrorCode = { PAYMENT_ORDER_NOT_FOUND: 40402, FORBIDDEN: 40301 } as const;

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
  const { paymentsRepo, membershipRepo } = ctx.payment;

  const dbOrder = await paymentsRepo.findByOrderNo(orderNo);
  if (!dbOrder) return sendError("订单不存在", 404, ApiErrorCode.PAYMENT_ORDER_NOT_FOUND);
  if (dbOrder.user_key !== auth.userKey) return sendError("无权操作此订单", 403, ApiErrorCode.FORBIDDEN);

  const body = await req.json().catch(() => ({}));
  const { found } = await fulfillMockPayment(paymentsRepo as any, membershipRepo as any, {
    orderNo,
    rawNotify: JSON.stringify(body || { mock: true }),
  });
  if (!found) return sendError("订单不存在", 404, ApiErrorCode.PAYMENT_ORDER_NOT_FOUND);

  return NextResponse.json({ success: true, order_no: orderNo, status: "paid" });
}
