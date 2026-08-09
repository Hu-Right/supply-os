// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPaymentRuntimeConfig, channelConfigured } from "../../../server/config/env";

describe("getPaymentRuntimeConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear payment-related env vars
    delete process.env.PAYMENT_MODE;
    delete process.env.ALIPAY_APP_ID;
    delete process.env.ALIPAY_PRIVATE_KEY;
    delete process.env.ALIPAY_PUBLIC_KEY;
    delete process.env.ALIPAY_NOTIFY_URL;
    delete process.env.WECHAT_APP_ID;
    delete process.env.WECHAT_MCH_ID;
    delete process.env.WECHAT_MERCHANT_ID;
    delete process.env.WECHAT_API_V3_KEY;
    delete process.env.WECHAT_PRIVATE_KEY;
    delete process.env.WECHAT_NOTIFY_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to mock mode", () => {
    const config = getPaymentRuntimeConfig();
    expect(config.mode).toBe("mock");
    expect(config.live_enabled).toBe(false);
  });

  it("sets live mode when PAYMENT_MODE=live", () => {
    process.env.PAYMENT_MODE = "live";
    const config = getPaymentRuntimeConfig();
    expect(config.mode).toBe("live");
    expect(config.live_enabled).toBe(true);
  });

  it("reports alipay as not configured when env vars missing", () => {
    const config = getPaymentRuntimeConfig();
    expect(config.providers.alipay.configured).toBe(false);
    expect(config.providers.alipay.missing_env.length).toBeGreaterThan(0);
  });

  it("reports alipay as configured when all env vars set", () => {
    process.env.ALIPAY_APP_ID = "test_app_id";
    process.env.ALIPAY_PRIVATE_KEY = "test_private_key";
    process.env.ALIPAY_PUBLIC_KEY = "test_public_key";
    process.env.ALIPAY_NOTIFY_URL = "https://example.com/notify";
    const config = getPaymentRuntimeConfig();
    expect(config.providers.alipay.configured).toBe(true);
    expect(config.providers.alipay.missing_env).toHaveLength(0);
  });

  it("reports wechat as not configured when env vars missing", () => {
    const config = getPaymentRuntimeConfig();
    expect(config.providers.wechat.configured).toBe(false);
  });

  it("accepts WECHAT_MERCHANT_ID as alias for WECHAT_MCH_ID", () => {
    process.env.WECHAT_APP_ID = "test";
    process.env.WECHAT_MERCHANT_ID = "test_merchant";
    process.env.WECHAT_API_V3_KEY = "test_key";
    process.env.WECHAT_PRIVATE_KEY = "test_private";
    process.env.WECHAT_NOTIFY_URL = "https://example.com/notify";
    const config = getPaymentRuntimeConfig();
    expect(config.providers.wechat.configured).toBe(true);
  });

  it("always reports mock as configured", () => {
    const config = getPaymentRuntimeConfig();
    expect(config.providers.mock.configured).toBe(true);
  });

  it("includes support info for each provider", () => {
    const config = getPaymentRuntimeConfig();
    expect(config.providers.mock.support.pc).toBeTruthy();
    expect(config.providers.alipay.support.pc).toBeTruthy();
    expect(config.providers.wechat.support.pc).toBeTruthy();
  });
});

describe("channelConfigured", () => {
  it("returns false for undefined", () => {
    expect(channelConfigured(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(channelConfigured("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(channelConfigured("   ")).toBe(false);
  });

  it("returns false for placeholder values", () => {
    expect(channelConfigured("MY_DEEPSEEK_API_KEY")).toBe(false);
    expect(channelConfigured("MY_GEMINI_API_KEY")).toBe(false);
  });

  it("returns true for real values", () => {
    expect(channelConfigured("sk-abc123")).toBe(true);
    expect(channelConfigured("my-api-key")).toBe(true);
  });

  it("trims whitespace before checking", () => {
    expect(channelConfigured("  sk-abc123  ")).toBe(true);
  });
});
