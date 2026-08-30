/**
 * POST /api/training/orders — 创建培训订单
 *
 * @module app/api/training/orders/route
 * @description 委托 training-payment 服务层完成：
 *   1. 从 DB 读取课程单价 → 计算总金额
 *   2. 生成订单号（TR + 日期 + 随机 hex）
 *   3. 通过支付策略生成二维码/支付链接
 *   4. 写入 training_orders 表
 *   5. 返回完整订单信息（含 qr_code, pay_url 等前端支付所需字段）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { createTrainingOrder } from "@/lib/services/training-payment";
import { extractClientIp } from "@/lib/utils/ip";

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const ctx = getContext();

  try {
    const result = await createTrainingOrder(ctx, ctx.trainingRepo, {
      courseId: Number(body.course_id),
      scheduleId: body.schedule_id != null ? Number(body.schedule_id) : undefined,
      registrationId: body.registration_id != null ? Number(body.registration_id) : undefined,
      participantCount: body.participant_count != null ? Number(body.participant_count) : undefined,
      provider: body.provider || "alipay",
      contactName: body.contact_name,
      telephone: body.telephone,
      clientIp: extractClientIp(req),
      userKey: auth.userKey,
      baseUrl: `${req.nextUrl.protocol}//${req.nextUrl.host}`,
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    const codeMap: Record<string, [number, number]> = {
      COURSE_NOT_FOUND: [400, 40030],
      COURSE_PRICE_INVALID: [400, 40032],
      PAYMENT_PROVIDER_UNAVAILABLE: [500, 40034],
      PAYMENT_GATEWAY_ERROR: [500, 40034],
      PAYMENT_QR_CODE_MISSING: [500, 40034],
    };
    const [status, code] = codeMap[msg] || [500, 50000];
    return NextResponse.json({ code, message: msg, error: msg }, { status });
  }
}
