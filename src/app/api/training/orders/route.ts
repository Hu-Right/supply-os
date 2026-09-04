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
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { createTrainingOrder } from "@/lib/services/training-payment";
import { extractClientIp } from "@/lib/utils/ip";

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

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
      baseUrl: `${req.nextUrl.protocol}//${req.nextUrl.host}`,
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    const messageMap: Record<string, string> = {
      COURSE_NOT_FOUND: "课程不存在或已下架",
      COURSE_PRICE_INVALID: "课程价格配置异常，请联系客服",
      PAYMENT_PROVIDER_UNAVAILABLE: "支付渠道暂不可用，请稍后重试",
      PAYMENT_GATEWAY_ERROR: "支付网关暂不可用，请稍后重试",
      PAYMENT_QR_CODE_MISSING: "支付二维码生成失败，请稍后重试",
      SCHEDULE_NOT_FOUND: "所选期次不存在",
      SCHEDULE_CAPACITY_EXCEEDED: "该期次名额已满，请选择其他期次",
    };
    const codeMap: Record<string, [number, number]> = {
      COURSE_NOT_FOUND: [404, 40030],
      COURSE_PRICE_INVALID: [500, 40032],
      PAYMENT_PROVIDER_UNAVAILABLE: [503, 40034],
      PAYMENT_GATEWAY_ERROR: [503, 40034],
      PAYMENT_QR_CODE_MISSING: [503, 40034],
      SCHEDULE_NOT_FOUND: [400, 40033],
      SCHEDULE_CAPACITY_EXCEEDED: [409, 40035],
    };
    // 未知异常不透传内部错误文本（审查 F50），留 trace 用 message 记日志
    const [status, code] = codeMap[msg] || [500, 50000];
    const message = messageMap[msg] || "下单失败，请稍后重试";
    if (!messageMap[msg]) console.error(`[training/orders] 下单异常:`, err);
    routeError(status, code, message);
  }
});
