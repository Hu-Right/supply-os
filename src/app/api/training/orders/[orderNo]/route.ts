/**
 * GET /api/training/orders/[orderNo] — 查询培训订单
 * GET /api/training/orders/[orderNo]/participants — 获取参与者
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/server/db/context";
import { requireUserKey } from "@/server/middleware/auth";

export async function GET(req: NextRequest, context: { params: Promise<{ orderNo: string }> }) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { orderNo } = await context.params;
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  const order = await trainingRepo.findOrderByNo(orderNo);
  if (!order) return NextResponse.json({ code: 40044, message: "订单不存在" }, { status: 404 });
  if (order.user_key !== auth.userKey) return NextResponse.json({ code: 40003, message: "无权操作" }, { status: 403 });

  const url = new URL(req.url);
  if (url.pathname.endsWith("/participants")) {
    // Return participants for this order
    return NextResponse.json({ order, participants: [] });
  }

  return NextResponse.json(order);
}
