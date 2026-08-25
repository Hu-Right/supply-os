/**
 * server/config/env.ts 测试
 * 覆盖 getPaymentRuntimeConfig, channelConfigured
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPaymentRuntimeConfig, channelConfigured } from "../../../server/config/env";

describe("getPaymentRuntimeConfig", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // 清除所有支付相关环境变量
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("PAYMENT_") || key.startsWith("ALIPAY_") || key.startsWith("WECHAT_")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("默认 mock 模式", () => {
    const config = getPaymentRuntimeConfig();
    expect(config.mode).toBe("mock");
    expect(config.live_enabled).toBe(false);
    expect(config.providers.mock.configured).toBe(true);
  });

  it("live 模式但缺少环境变量", () => {
    process.env.PAYMENT_MODE = "live";
    const config = getPaymentRuntimeConfig();
    expect(config.mode).toBe("live");
    expect(config.live_enabled).toBe(true);
    // 支付宝未配置
    expect(config.providers.alipay.configured).toBe(false);
    expect(config.providers.alipay.missing_env.length).toBeGreaterThan(0);
    // 微信未配置
    expect(config.providers.wechat.configured).toBe(false);
  });

  it("live 模式 + 支付宝环境变量齐全", () => {
    process.env.PAYMENT_MODE = "live";
    process.env.ALIPAY_APP_ID = "test-app-id";
    process.env.ALIPAY_PRIVATE_KEY = "test-key";
    process.env.ALIPAY_PUBLIC_KEY = "test-pub";
    process.env.ALIPAY_NOTIFY_URL = "https://example.com/notify";
    const config = getPaymentRuntimeConfig();
    expect(config.providers.alipay.configured).toBe(true);
    expect(config.providers.alipay.missing_env).toEqual([]);
  });

  it("微信支持 WECHAT_MCH_ID 或 WECHAT_MERCHANT_ID", () => {
    process.env.PAYMENT_MODE = "live";
    process.env.WECHAT_APP_ID = "wx-id";
    process.env.WECHAT_API_V3_KEY = "v3-key";
    process.env.WECHAT_PRIVATE_KEY = "wx-key";
    process.env.WECHAT_NOTIFY_URL = "https://example.com/wx-notify";
    // 只设 WECHAT_MERCHANT_ID（旧名）
    process.env.WECHAT_MERCHANT_ID = "mch-001";
    const config = getPaymentRuntimeConfig();
    expect(config.providers.wechat.configured).toBe(true);
  });
});

describe("channelConfigured", () => {
  it("有效值返回 true", () => {
    expect(channelConfigured("sk-abc123")).toBe(true);
  });

  it("空值返回 false", () => {
    expect(channelConfigured("")).toBe(false);
    expect(channelConfigured(undefined)).toBe(false);
    expect(channelConfigured("   ")).toBe(false);
  });

  it("占位符值返回 false", () => {
    expect(channelConfigured("MY_DEEPSEEK_API_KEY")).toBe(false);
    expect(channelConfigured("MY_GEMINI_API_KEY")).toBe(false);
  });

  it("占位符带空白也返回 false", () => {
    expect(channelConfigured("  MY_DEEPSEEK_API_KEY  ")).toBe(false);
  });
});
