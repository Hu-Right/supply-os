/**
 * GET /api/training/orders/:orderNo — 查询培训订单状态
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { queryTrainingOrderStatus } from "@/lib/services/training-payment";

const ApiErrorCode = {
  TRAINING_ORDER_NOT_FOUND: 40406,
  TRAINING_ORDER_FORBIDDEN: 40303,
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
  if (order.user_key && order.user_key !== auth.userKey) return sendError("无权操作此订单", 403, ApiErrorCode.TRAINING_ORDER_FORBIDDEN);

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
