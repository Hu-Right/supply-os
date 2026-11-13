/**
 * GET /api/training/orders/:orderNo/participants — 查询订单学员名单
 *
 * @description 2026-11-13 收敛：数据源改为 `training_enrollments`（一行 = 一位学员），
 *              `training_participants` 已删除。
 *
 *              POST 已移除：学员由报名接口（POST /api/training/register）在支付前一次写全，
 *              不再有「支付成功后再补名单」的第二次写入，因此也没有「改名单」的写入口。
 *              需要改名单应重新报名（未支付）或在订单外人工处理。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { trainingParticipantsViewOf } from "@/lib/services/training/view";
import {
  EC_TRAINING_ORDER_NOT_FOUND, EC_TRAINING_ORDER_FORBIDDEN,
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

    const participants = await trainingRepo.listEnrollmentsByOrderId(order.id);
    return NextResponse.json({
      success: true,
      orderNo,
      // 行是 SELECT * 整行（含 user_id/order_id/ip/时间戳），必须过视图才上网；
      // 下面的 participantCount 用原始长度，不受视图只发 7 键影响。
      participants: trainingParticipantsViewOf(participants),
      participantCount: participants.length,
    });
  },
);
