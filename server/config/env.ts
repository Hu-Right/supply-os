/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
export function getPaymentRuntimeConfig() {
  const mode = process.env.PAYMENT_MODE === "live" ? "live" : "mock";
  const alipayRequired = ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "ALIPAY_NOTIFY_URL"];
  const wechatRequired = ["WECHAT_APP_ID", "WECHAT_MCH_ID", "WECHAT_API_V3_KEY", "WECHAT_PRIVATE_KEY", "WECHAT_NOTIFY_URL"];
  const hasEnv = (name: string) => Boolean(process.env[name] && String(process.env[name]).trim());
  const missing = (names: string[]) => names.filter((name) => !hasEnv(name));
  const wechatMchConfigured = hasEnv("WECHAT_MCH_ID") || hasEnv("WECHAT_MERCHANT_ID");
  const wechatMissing = wechatRequired.filter((name) => name === "WECHAT_MCH_ID" ? !wechatMchConfigured : !hasEnv(name));

  return {
    mode,
    live_enabled: mode === "live",
    providers: {
      alipay: {
        configured: missing(alipayRequired).length === 0,
        missing_env: missing(alipayRequired),
        support: {
          pc: "alipay.trade.page.pay",
          h5: "planned: alipay.trade.wap.pay, current provider uses page.pay skeleton",
        },
      },
      wechat: {
        configured: wechatMissing.length === 0,
        missing_env: wechatMissing,
        accepted_mch_env: ["WECHAT_MCH_ID", "WECHAT_MERCHANT_ID"],
        support: {
          h5: "WeChat Pay H5 outside WeChat browser, provider skeleton",
          pc: "Native QR planned, current provider returns placeholder qr_code_url",
        },
      },
      mock: {
        configured: true,
        support: {
          pc: "auto-paid polling demo",
          h5: "auto-paid polling demo",
        },
      },
    },
  };
}

// 占位符值与空值均视为"未配置该通道"（.env.example 的示例值不触发真实调用）
const CHANNEL_PLACEHOLDERS = new Set([
  "MY_DEEPSEEK_API_KEY",
  "MY_GEMINI_API_KEY",
]);
export function channelConfigured(value: string | undefined): boolean {
  return !!value && value.trim() !== "" && !CHANNEL_PLACEHOLDERS.has(value.trim());
}
