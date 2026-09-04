/**
 * GET  /api/training/orders/:orderNo/participants — 查询学员信息
 * POST /api/training/orders/:orderNo/participants — 保存学员信息
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_TRAINING_ORDER_NOT_FOUND, EC_TRAINING_ORDER_FORBIDDEN,
  EC_TRAINING_ORDER_NOT_PAID, EC_TRAINING_PARTICIPANTS_INVALID,
  EC_TRAINING_PARTICIPANTS_COUNT_MISMATCH,
} from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ orderNo: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { orderNo } = await params;
    const ctx = getContext();
    const trainingRepo = ctx.trainingRepo;

    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) routeError(404, EC_TRAINING_ORDER_NOT_FOUND, "订单不存在");
    if (order.user_id && order.user_id !== auth.userId) routeError(403, EC_TRAINING_ORDER_FORBIDDEN, "无权查看此订单");

    const participants = await trainingRepo.getParticipantsByOrderId(order.id);
    return NextResponse.json({
      success: true,
      order_no: orderNo,
      participants,
      participant_count: participants.length,
    });
  },
);

export const POST = withRoute<{ params: Promise<{ orderNo: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { orderNo } = await params;
    const ctx = getContext();
    const trainingRepo = ctx.trainingRepo;

    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) routeError(404, EC_TRAINING_ORDER_NOT_FOUND, "订单不存在");
    if (order.status !== "paid") routeError(400, EC_TRAINING_ORDER_NOT_PAID, "订单尚未支付，无法保存学员信息");
    if (order.user_id && order.user_id !== auth.userId) routeError(403, EC_TRAINING_ORDER_FORBIDDEN, "无权操作此订单");

    const body = await req.json();
    const participants = body.participants;
    if (!Array.isArray(participants) || participants.length === 0) {
      routeError(400, EC_TRAINING_PARTICIPANTS_INVALID, "学员信息不能为空");
    }
    if (participants.length !== order.participant_count) {
      routeError(
        400,
        EC_TRAINING_PARTICIPANTS_COUNT_MISMATCH,
        `学员数量不匹配：订单要求 ${order.participant_count} 人，实际提交 ${participants.length} 人`,
      );
    }
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      if (!p.full_name || !p.full_name.trim()) {
        routeError(400, EC_TRAINING_PARTICIPANTS_INVALID, `第 ${i + 1} 位学员姓名不能为空`);
      }
    }

    await trainingRepo.saveParticipants(order.id, participants);
    return NextResponse.json({
      success: true,
      message: "学员信息保存成功",
      order_no: orderNo,
      participant_count: participants.length,
    });
  },
);
