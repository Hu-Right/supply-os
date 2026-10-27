/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// getPaymentRuntimeConfig 已随之唯一调用方（/api/payments/config-status 死端点）一并删除：
// 它把商户号/环境变量名清单拼成响应体，既无前端消费方，又是一个未使用的信息暴露面。
// 前线支付能力探测走公开最小端点 /api/payment/config-status（单数）。

// 占位符值与空值均视为"未配置该通道"（.env.example 的示例值不触发真实调用）
const CHANNEL_PLACEHOLDERS = new Set([
  "MY_DEEPSEEK_API_KEY",
  "MY_GEMINI_API_KEY",
]);
export function channelConfigured(value: string | undefined): boolean {
  return !!value && value.trim() !== "" && !CHANNEL_PLACEHOLDERS.has(value.trim());
}
