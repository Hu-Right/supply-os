/**
 * GET /api/payment/config-status — 公共支付配置状态（最小字段）
 *
 * @module app/api/payment/config-status/route
 * @description 前端支付环境探测器（env-detector）轮询此端点，
 *              判断支付宝/微信是否已配置，决定展示真实支付还是 Mock。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET() {
  const ctx = getContext();
  const { paymentService, paymentMode } = ctx.payment;
  const live = paymentMode === "live";
  return NextResponse.json({
    providers: {
      alipay: { configured: live && paymentService.hasStrategy("alipay") },
      wechat: { configured: live && paymentService.hasStrategy("wechat") },
    },
  });
}
