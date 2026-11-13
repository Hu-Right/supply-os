/**
 * POST /api/training/orders — 创建培训订单
 *
 * @module app/api/training/orders/route
 * @description 委托 TrainingPaymentService 完成：
 *   1. 从 DB 读取课程单价 → 计算总金额
 *   2. 生成订单号（TR + 日期 + 随机 hex）
 *   3. 通过支付策略生成二维码/支付链接
 *   4. 写入统一订单表 orders（product_kind='course'；training_orders 已退役，ADR-0019）
 *   5. 返回完整订单信息（含 qrCodeUrl / payUrl 等前端支付所需字段，键名按红线② camelCase）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { extractClientIp } from "@/lib/utils/ip";
import {
  EC_TRAINING_COURSE_NOT_FOUND, EC_TRAINING_COURSE_PRICE_INVALID,
  EC_TRAINING_PAYMENT_UNAVAILABLE, EC_TRAINING_SCHEDULE_NOT_FOUND,
  EC_TRAINING_SCHEDULE_CAPACITY_EXCEEDED, EC_TRAINING_PARTICIPANTS_INVALID,
  EC_DUPLICATE, EC_NOT_FOUND, EC_INTERNAL_ERROR,
} from "@/shared/constants/api";

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const body = await req.json();
  const ctx = getContext();

  try {
    const result = await ctx.payment.trainingPaymentService.createOrder({
      userId: auth.userId,
      scheduleId: body.schedule_id != null ? Number(body.schedule_id) : undefined,
      // 报名先落库、下单再绑定：人数由报名行数决定，不采信客户端传入的 participant_count
      registrationIds: Array.isArray(body.registration_ids)
        ? body.registration_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
        : undefined,
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
      REGISTRATION_REQUIRED: "请先填写参训学员信息",
      REGISTRATION_NOT_FOUND: "报名记录不存在或不属于当前账号",
      REGISTRATION_ALREADY_BOUND: "该报名已绑定其他订单，请刷新后重试",
      REGISTRATION_SCHEDULE_MISMATCH: "报名期次与所选期次不一致，请重新选择",
      REGISTRATION_BOUND_RACE: "报名记录已被其他订单占用，请重新提交",
      PARTICIPANT_LIMIT_EXCEEDED: "单笔订单参训人数超出上限",
    };
    const codeMap: Record<string, [number, number]> = {
      COURSE_NOT_FOUND: [404, EC_TRAINING_COURSE_NOT_FOUND],
      COURSE_PRICE_INVALID: [500, EC_TRAINING_COURSE_PRICE_INVALID],
      PAYMENT_PROVIDER_UNAVAILABLE: [503, EC_TRAINING_PAYMENT_UNAVAILABLE],
      PAYMENT_GATEWAY_ERROR: [503, EC_TRAINING_PAYMENT_UNAVAILABLE],
      PAYMENT_QR_CODE_MISSING: [503, EC_TRAINING_PAYMENT_UNAVAILABLE],
      SCHEDULE_NOT_FOUND: [400, EC_TRAINING_SCHEDULE_NOT_FOUND],
      SCHEDULE_CAPACITY_EXCEEDED: [409, EC_TRAINING_SCHEDULE_CAPACITY_EXCEEDED],
      REGISTRATION_REQUIRED: [400, EC_TRAINING_PARTICIPANTS_INVALID],
      REGISTRATION_NOT_FOUND: [404, EC_NOT_FOUND],
      REGISTRATION_ALREADY_BOUND: [409, EC_DUPLICATE],
      REGISTRATION_SCHEDULE_MISMATCH: [400, EC_TRAINING_PARTICIPANTS_INVALID],
      REGISTRATION_BOUND_RACE: [409, EC_DUPLICATE],
      PARTICIPANT_LIMIT_EXCEEDED: [400, EC_TRAINING_PARTICIPANTS_INVALID],
    };
    // 未知异常不透传内部错误文本（审查 F50），留 trace 用 message 记日志
    const [status, code] = codeMap[msg] || [500, EC_INTERNAL_ERROR];
    const message = messageMap[msg] || "下单失败，请稍后重试";
    if (!messageMap[msg]) console.error(`[training/orders] 下单异常:`, err);
    routeError(status, code, message);
  }
});
