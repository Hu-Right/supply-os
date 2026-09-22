/**
 * 统一支付渠道解析
 * Unified Payment Provider Resolver
 *
 * @module lib/payment/pipeline/provider-resolver
 * @description ARCH-PN（2026-09-11）：支付归一化重构——提取散落在各处的渠道解析逻辑。
 *              统一行为：
 *              - live 模式下渠道未注册 → 抛 PAYMENT_PROVIDER_UNAVAILABLE，不回退 mock
 *              - mock 模式（开发环境）→ 统一返回 "mock"
 *
 *              消费方：TrainingPaymentService、PaymentService.createOrder 等。
 */
import type { PaymentProviderName } from "../../types/payment";

/**
 * 解析实际可用的支付渠道
 *
 * @param paymentMode  当前支付模式（"live" | "mock"）
 * @param hasStrategy  判断渠道策略是否已注册的函数（来自 Orchestrator）
 * @param requested    请求的渠道名称
 * @returns 实际可用的支付渠道名称
 * @throws PAYMENT_PROVIDER_UNAVAILABLE  live 模式下渠道未配置
 */
export function resolvePaymentProvider(
  paymentMode: "live" | "mock",
  hasStrategy: (name: PaymentProviderName) => boolean,
  requested: string,
): PaymentProviderName {
  if (paymentMode === "live") {
    if (requested === "alipay" || requested === "wechat") {
      if (hasStrategy(requested as PaymentProviderName)) {
        return requested as PaymentProviderName;
      }
      // 渠道未注册（未配置密钥）→ 明确拒绝，不回退 mock
    }
    throw new Error("PAYMENT_PROVIDER_UNAVAILABLE");
  }
  return "mock";
}
