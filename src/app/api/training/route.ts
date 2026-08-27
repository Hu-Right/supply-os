/**
 * 培训域路由（Register / Downloads / Orders / Participants）
 * Training domain routes
 *
 * @module app/api/training/route
 * @description 从 Express routes/training.routes.ts 迁移。
 *              涵盖：报名、下载追踪/统计、订单创建/查询/支付宝跳转/Mock履约、学员管理。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { fulfillTrainingOrder, queryTrainingOrderStatus } from "@/server/services/training-payment";

// ─ 错误码定义 ──
const ApiErrorCode = {
  TRAINING_ORDER_NOT_FOUND: 40406,
  TRAINING_ORDER_FORBIDDEN: 40303,
  TRAINING_ORDER_NOT_PAID: 40020,
  TRAINING_PARTICIPANTS_INVALID: 40021,
  TRAINING_PARTICIPANTS_COUNT_MISMATCH: 40022,
} as const;

function sendError(message: string, status: number, code: number) {
  return NextResponse.json({ code, message, error: message }, { status });
}

// ── GET 端点 ──
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  // GET /api/training/landing — 培训着陆页
  if (path === "/api/training/landing") {
    const [course, schedules] = await Promise.all([
      trainingRepo.getActiveCourse(),
      trainingRepo.getActiveCourse().then((c) => (c ? trainingRepo.listSchedules(c.id) : [])),
    ]);
    return NextResponse.json({ course, schedules });
  }

  // GET /api/training/downloads/stats — 下载统计
  if (path === "/api/training/downloads/stats") {
    const stats = await trainingRepo.listDownloadStats();
    return NextResponse.json(stats);
  }

  // GET /api/training/orders/:order_no/alipay-redirect — 支付宝跳转
  if (/^\/api\/training\/orders\/[^/]+\/alipay-redirect$/.test(path)) {
    const orderNoMatch = path.match(/\/api\/training\/orders\/([^/]+)\/alipay-redirect$/);
    const orderNo = orderNoMatch?.[1] || "";

    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) return new Response("Order not found", { status: 404 });
    if (order.provider !== "alipay") return new Response("Not an Alipay order", { status: 400 });
    if (order.status !== "pending") return new Response("Order is not pending", { status: 400 });
    if (!order.pay_url) return new Response("Payment url missing", { status: 400 });

    return new Response(order.pay_url, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // GET /api/training/orders/:order_no — 查询培训订单状态
  if (/^\/api\/training\/orders\/[^/]+$/.test(path)) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const orderNoMatch = path.match(/\/api\/training\/orders\/([^/]+)$/);
    const orderNo = orderNoMatch?.[1] || "";

    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) return sendError("订单不存在", 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND);
    if (order.user_key !== auth.userKey) return sendError("无权操作此订单", 403, ApiErrorCode.TRAINING_ORDER_FORBIDDEN);

    try {
      const result = await queryTrainingOrderStatus(ctx as any, trainingRepo as any, orderNo);
      return NextResponse.json(result);
    } catch (err: unknown) {
      if (String((err as Error)?.message || "") === "ORDER_NOT_FOUND") {
        return sendError("订单不存在", 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND);
      }
      throw err;
    }
  }

  // GET /api/training/orders/:order_no/participants — 查询学员信息
  if (/^\/api\/training\/orders\/[^/]+\/participants$/.test(path)) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;

    const orderNoMatch = path.match(/\/api\/training\/orders\/([^/]+)\/participants$/);
    const orderNo = orderNoMatch?.[1] || "";

    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) return sendError("订单不存在", 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND);
    if (order.user_key !== auth.userKey) return sendError("无权查看此订单", 403, ApiErrorCode.TRAINING_ORDER_FORBIDDEN);

    const participants = await trainingRepo.getParticipantsByOrderId(order.id);
    return NextResponse.json({
      success: true,
      order_no: orderNo,
      participants,
      participant_count: participants.length,
    });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}

// ── POST 端点 ──
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  // POST /api/training/register — 培训报名
  if (path === "/api/training/register") {
    const body = await req.json();
    const result = await trainingRepo.insertRegistration(body);
    return NextResponse.json({ success: true, id: result }, { status: 201 });
  }

  // POST /api/training/downloads/track — 下载追踪
  if (path === "/api/training/downloads/track") {
    const { material_id, file_name } = await req.json();
    const count = await trainingRepo.incrementDownloadCount(material_id, file_name);
    return NextResponse.json({ success: true, count });
  }

  // 订单相关端点需要认证
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  // POST /api/training/orders — 创建培训订单
  if (path === "/api/training/orders") {
    const body = await req.json();
    const orderNo = await trainingRepo.createOrder({ ...body, user_key: auth.userKey });
    return NextResponse.json({ success: true, order_no: orderNo }, { status: 201 });
  }

  // POST /api/training/orders/:order_no/mock-paid — Mock 支付履约
  if (/^\/api\/training\/orders\/[^/]+\/mock-paid$/.test(path)) {
    // 仅在 mock 模式下注册
    if (ctx.payment.paymentMode === "live") {
      return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
    }

    const orderNoMatch = path.match(/\/api\/training\/orders\/([^/]+)\/mock-paid$/);
    const orderNo = orderNoMatch?.[1] || "";

    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) return sendError("订单不存在", 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND);
    if (order.user_key !== auth.userKey) return sendError("无权操作此订单", 403, ApiErrorCode.TRAINING_ORDER_FORBIDDEN);

    await fulfillTrainingOrder(trainingRepo as any, orderNo, `MOCK-${orderNo}`);
    return NextResponse.json({ success: true, order_no: orderNo, status: "paid" });
  }

  // POST /api/training/orders/:order_no/participants — 保存学员信息
  if (/^\/api\/training\/orders\/[^/]+\/participants$/.test(path)) {
    const orderNoMatch = path.match(/\/api\/training\/orders\/([^/]+)\/participants$/);
    const orderNo = orderNoMatch?.[1] || "";

    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) return sendError("订单不存在", 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND);
    if (order.status !== "paid") return sendError("订单尚未支付，无法保存学员信息", 400, ApiErrorCode.TRAINING_ORDER_NOT_PAID);
    if (order.user_key !== auth.userKey) return sendError("无权操作此订单", 403, ApiErrorCode.TRAINING_ORDER_FORBIDDEN);

    const body = await req.json();
    const participants = body.participants;
    if (!Array.isArray(participants) || participants.length === 0) {
      return sendError("学员信息不能为空", 400, ApiErrorCode.TRAINING_PARTICIPANTS_INVALID);
    }
    if (participants.length !== order.participant_count) {
      return sendError(
        `学员数量不匹配：订单要求 ${order.participant_count} 人，实际提交 ${participants.length} 人`,
        400,
        ApiErrorCode.TRAINING_PARTICIPANTS_COUNT_MISMATCH,
      );
    }
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      if (!p.full_name || !p.full_name.trim()) {
        return sendError(`第 ${i + 1} 位学员姓名不能为空`, 400, ApiErrorCode.TRAINING_PARTICIPANTS_INVALID);
      }
    }

    await trainingRepo.saveParticipants(order.id, participants);
    return NextResponse.json({
      success: true,
      message: "学员信息保存成功",
      order_no: orderNo,
      participant_count: participants.length,
    });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
