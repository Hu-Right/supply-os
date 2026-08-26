/**
 * POST /api/training/register — 培训报名
 * GET /api/training/landing — 培训着陆页（课程+排期）
 * POST /api/training/downloads/track — 下载追踪
 * GET /api/training/downloads/stats — 下载统计
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  if (url.pathname.endsWith("/landing")) {
    const [course, schedules] = await Promise.all([
      trainingRepo.getActiveCourse(),
      trainingRepo.getActiveCourse().then(c => c ? trainingRepo.listSchedules(c.id) : []),
    ]);
    return NextResponse.json({ course, schedules });
  }

  if (url.pathname.endsWith("/downloads/stats")) {
    const stats = await trainingRepo.listDownloadStats();
    return NextResponse.json(stats);
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  if (url.pathname.endsWith("/register")) {
    const body = await req.json();
    const result = await trainingRepo.insertRegistration(body);
    return NextResponse.json({ success: true, id: result }, { status: 201 });
  }

  if (url.pathname.endsWith("/downloads/track")) {
    const { material_id, file_name } = await req.json();
    const count = await trainingRepo.incrementDownloadCount(material_id, file_name);
    return NextResponse.json({ success: true, count });
  }

  // 订单相关端点需要认证
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  if (url.pathname.endsWith("/orders")) {
    const body = await req.json();
    const orderNo = await trainingRepo.createOrder({ ...body, user_key: auth.userKey });
    return NextResponse.json({ success: true, order_no: orderNo }, { status: 201 });
  }

  // /orders/:order_no/mock-paid
  if (url.pathname.match(/\/orders\/[^/]+\/mock-paid$/)) {
    const orderNo = url.pathname.split("/").slice(-2, -1)[0];
    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) return NextResponse.json({ code: 40044, message: "订单不存在" }, { status: 404 });
    if (order.user_key !== auth.userKey) return NextResponse.json({ code: 40003, message: "无权操作" }, { status: 403 });
    await trainingRepo.updateOrderStatus(orderNo, "paid");
    return NextResponse.json({ success: true });
  }

  // /orders/:order_no/participants (POST)
  if (url.pathname.match(/\/orders\/[^/]+\/participants$/) && req.method === "POST") {
    const orderNo = url.pathname.split("/").slice(-2, -1)[0];
    const body = await req.json();
    // Add participants logic
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
