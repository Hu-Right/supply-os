/**
 * GET /api/payments/config-status — 支付配置状态（需登录）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { getPaymentRuntimeConfig } from "@/lib/config/env";

export async function GET(req: Request) {
  const auth = await requireUserKey(req as any);
  if (auth instanceof Response) return auth;

  const ctx = getContext();
  const { paymentsRepo } = ctx.payment;
  const configs = await paymentsRepo.listActiveProviderConfigs();
  const runtime = getPaymentRuntimeConfig();
  return NextResponse.json({
    ...runtime,
    active_provider_configs: configs.map((item) => ({
      provider: item.provider,
      mode: item.mode,
      app_id: item.app_id ? `${String(item.app_id).slice(0, 6)}***` : null,
      merchant_id: item.merchant_id ? `${String(item.merchant_id).slice(0, 6)}***` : null,
      notify_url: item.notify_url || null,
      is_active: Boolean(item.is_active),
    })),
    note: runtime.live_enabled
      ? "PAYMENT_MODE=live: 真实支付网关。"
      : "PAYMENT_MODE 未设置为 live: Mock 模式。",
    required_env: {
      alipay: ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "ALIPAY_NOTIFY_URL"],
      wechat: ["WECHAT_APP_ID", "WECHAT_MCH_ID", "WECHAT_API_V3_KEY", "WECHAT_PRIVATE_KEY", "WECHAT_NOTIFY_URL"],
    },
  });
}
