/**
 * GET /api/payment/orders — 支付订单历史
 * GET /api/payment/unlocks — 解锁历史
 * POST /api/payment/orders — 创建支付订单
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const ctx = getContext();
  const paymentsRepo = ctx.payment.paymentsRepo;

  if (url.pathname.endsWith("/orders")) {
    const status = req.nextUrl.searchParams.get("status") || "all";
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 20, 100);
    const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;
    const orders = await paymentsRepo.listOrders(auth.userKey, status, limit, offset);
    const total = await paymentsRepo.countOrders(auth.userKey, status);
    return NextResponse.json({ orders, total });
  }

  if (url.pathname.endsWith("/unlocks")) {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 20, 100);
    const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;
    const lang = req.nextUrl.searchParams.get("lang") || null;
    const unlocks = await paymentsRepo.listUnlocks(auth.userKey, limit, offset, lang ? { lang } : null);
    const total = await paymentsRepo.countUnlocks(auth.userKey);
    return NextResponse.json({ unlocks, total });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const ctx = getContext();
  const paymentsRepo = ctx.payment.paymentsRepo;

  if (url.pathname.endsWith("/orders")) {
    const body = await req.json();
    const orderNo = await paymentsRepo.createOrder({ ...body, user_key: auth.userKey });
    return NextResponse.json({ success: true, order_no: orderNo }, { status: 201 });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
