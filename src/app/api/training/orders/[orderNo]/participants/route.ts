/**
 * GET  /api/training/orders/:orderNo/participants — 查询学员信息
 * POST /api/training/orders/:orderNo/participants — 保存学员信息
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> },
) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { orderNo } = await params;
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  const order = await trainingRepo.findOrderByNo(orderNo);
  if (!order) return sendError("订单不存在", 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND);
  if (order.user_key && order.user_key !== auth.userKey) return sendError("无权查看此订单", 403, ApiErrorCode.TRAINING_ORDER_FORBIDDEN);

  const participants = await trainingRepo.getParticipantsByOrderId(order.id);
  return NextResponse.json({
    success: true,
    order_no: orderNo,
    participants,
    participant_count: participants.length,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> },
) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const { orderNo } = await params;
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  const order = await trainingRepo.findOrderByNo(orderNo);
  if (!order) return sendError("订单不存在", 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND);
  if (order.status !== "paid") return sendError("订单尚未支付，无法保存学员信息", 400, ApiErrorCode.TRAINING_ORDER_NOT_PAID);
  if (order.user_key && order.user_key !== auth.userKey) return sendError("无权操作此订单", 403, ApiErrorCode.TRAINING_ORDER_FORBIDDEN);

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
