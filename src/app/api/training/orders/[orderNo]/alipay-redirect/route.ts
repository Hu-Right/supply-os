/**
 * GET /api/training/orders/:orderNo/alipay-redirect — 支付宝跳转 HTML 表单
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> },
) {
  const { orderNo } = await params;
  const ctx = getContext();
  const order = await ctx.trainingRepo.findOrderByNo(orderNo);
  if (!order) return new Response("Order not found", { status: 404 });
  if (order.provider !== "alipay") return new Response("Not an Alipay order", { status: 400 });
  if (order.status !== "pending") return new Response("Order is not pending", { status: 400 });
  if (!order.pay_url) return new Response("Payment url missing", { status: 400 });

  return new Response(order.pay_url, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
