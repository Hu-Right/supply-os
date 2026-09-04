/**
 * POST /api/payments/:orderNo/mock-paid — Mock 支付履约（仅 mock 模式）
 *
 * ARCH-B+（2026-09-01）：通过 Orchestrator 按订单号前缀路由至对应业务服务。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { EC_PAYMENT_ORDER_NOT_FOUND, EC_ACCESS_FORBIDDEN } from "@/shared/constants/api";

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
  const { orchestrator } = ctx.payment;

  const dbOrder = await orchestrator.findOrder(orderNo);
  if (!dbOrder) return sendError("订单不存在", 404, EC_PAYMENT_ORDER_NOT_FOUND);
  if (dbOrder.user_id !== auth.userId) return sendError("无权操作此订单", 403, EC_ACCESS_FORBIDDEN);

  const body = await req.json().catch(() => ({}));
  const { found } = await orchestrator.fulfillMockOrder(
    orderNo, JSON.stringify(body || { mock: true }),
  );
  if (!found) return sendError("订单不存在", 404, EC_PAYMENT_ORDER_NOT_FOUND);

  return NextResponse.json({ success: true, order_no: orderNo, status: "paid" });
}
