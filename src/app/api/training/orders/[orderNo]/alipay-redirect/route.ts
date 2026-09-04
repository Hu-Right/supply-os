/**
 * GET /api/training/orders/:orderNo/alipay-redirect — 支付宝跳转 HTML 表单
 */
import { NextRequest } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> },
) {
  // 归属校验（审查 F27）：仅订单本人可获取支付表单（历史无归属订单除外）
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { orderNo } = await params;
  const ctx = getContext();
  const order = await ctx.trainingRepo.findOrderByNo(orderNo);
  if (!order) return new Response("Order not found", { status: 404 });
  if (order.user_id && order.user_id !== auth.userId) return new Response("Forbidden", { status: 403 });
  if (order.provider !== "alipay") return new Response("Not an Alipay order", { status: 400 });
  if (order.status !== "pending") return new Response("Order is not pending", { status: 400 });
  if (!order.pay_url) return new Response("Payment url missing", { status: 400 });

  return new Response(order.pay_url, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
