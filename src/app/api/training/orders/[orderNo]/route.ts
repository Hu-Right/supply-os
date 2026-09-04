/**
 * GET /api/training/orders/:orderNo — 查询培训订单状态
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { queryTrainingOrderStatus } from "@/lib/services/training-payment";
import { EC_TRAINING_ORDER_NOT_FOUND, EC_TRAINING_ORDER_FORBIDDEN } from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ orderNo: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { orderNo } = await params;
    const ctx = getContext();
    const trainingRepo = ctx.trainingRepo;

    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) routeError(404, EC_TRAINING_ORDER_NOT_FOUND, "订单不存在");
    if (order.user_id && order.user_id !== auth.userId) routeError(403, EC_TRAINING_ORDER_FORBIDDEN, "无权操作此订单");

    try {
      const result = await queryTrainingOrderStatus(ctx as any, trainingRepo as any, orderNo);
      return NextResponse.json(result);
    } catch (err: unknown) {
      if (String((err as Error)?.message || "") === "ORDER_NOT_FOUND") {
        routeError(404, EC_TRAINING_ORDER_NOT_FOUND, "订单不存在");
      }
      throw err;
    }
  },
);
