/**
 * POST /api/training/orders — 创建培训订单
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const ctx = getContext();
  const orderNo = await ctx.trainingRepo.createOrder({ ...body, user_key: auth.userKey });
  return NextResponse.json({ success: true, order_no: orderNo }, { status: 201 });
}
