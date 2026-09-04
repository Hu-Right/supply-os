/**
 * GET /api/payment/orders/:orderNo — 查询订单状态
 *
 * @module app/api/payment/orders/[orderNo]/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { EC_PAYMENT_ORDER_NOT_FOUND, EC_ACCESS_FORBIDDEN } from "@/shared/constants/api";

function sendError(message: string, status: number, code: number) {
  return NextResponse.json({ code, message, error: message }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> },
) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { orderNo } = await params;
  const decodedOrderNo = decodeURIComponent(orderNo);

  const url = req.nextUrl;
  const ctx = getContext();
  const { orchestrator } = ctx.payment;

  // ARCH-B+（2026-09-01）：通过 Orchestrator 按订单号前缀路由查询
  const order = await orchestrator.findOrder(decodedOrderNo);
  if (!order) return sendError("订单不存在", 404, EC_PAYMENT_ORDER_NOT_FOUND);
  if (order.user_id !== auth.userId) return sendError("无权操作", 403, EC_ACCESS_FORBIDDEN);

  const tradeNo = url.searchParams.get("trade_no") || "";
  const result = await orchestrator.queryOrder(decodedOrderNo, tradeNo);
  return NextResponse.json(result);
}
