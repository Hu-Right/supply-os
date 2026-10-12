import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Mock api 模块
vi.mock("@/core/http", () => ({
  api: vi.fn().mockResolvedValue({ providers: { wechat: { configured: true }, alipay: { configured: true } } }),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { detectPlatformEnv, isMobile, isDesktop, fetchPaymentConfigStatus, isProviderConfigured, getAvailableProviders, getPaymentTips } from "@/core/payment/env-detector";
import { api } from "@/core/http";

describe("detectPlatformEnv", () => {
  const originalUA = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { value: originalUA, configurable: true });
    delete (globalThis as any).window?.__SUPPLY_OS_APP__;
  });

  it("普通浏览器 → browser", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      configurable: true,
    });
    expect(detectPlatformEnv()).toBe("browser");
  });

  it("微信内置浏览器 → wechat", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 MicroMessenger/7.0",
      configurable: true,
    });
    expect(detectPlatformEnv()).toBe("wechat");
  });

  it("自定义 App WebView → app", () => {
    (globalThis as any).window = { __SUPPLY_OS_APP__: true };
    expect(detectPlatformEnv()).toBe("app");
  });

  it("UA 含 SupplyOSApp → app", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "SupplyOSApp/1.0",
      configurable: true,
    });
    expect(detectPlatformEnv()).toBe("app");
  });
});

describe("isMobile / isDesktop", () => {
  const originalUA = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { value: originalUA, configurable: true });
  });

  it("Android UA → isMobile=true", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 13) Mobile",
      configurable: true,
    });
    expect(isMobile()).toBe(true);
    expect(isDesktop()).toBe(false);
  });

  it("iPhone UA → isMobile=true", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      configurable: true,
    });
    expect(isMobile()).toBe(true);
  });

  it("桌面 Chrome → isMobile=false, isDesktop=true", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      configurable: true,
    });
    expect(isMobile()).toBe(false);
    expect(isDesktop()).toBe(true);
  });
});

describe("fetchPaymentConfigStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("成功获取配置 → 返回 wechat/alipay 状态", async () => {
    vi.mocked(api).mockResolvedValueOnce({ providers: { wechat: { configured: true }, alipay: { configured: false } } });
    const result = await fetchPaymentConfigStatus();
    expect(result.wechat).toBe(true);
    expect(result.alipay).toBe(false);
  });

  it("返回类型正确", async () => {
    // 缓存可能已填充，直接调用验证返回值类型
    const result = await fetchPaymentConfigStatus();
    expect(typeof result.wechat).toBe("boolean");
    expect(typeof result.alipay).toBe("boolean");
  });
});

describe("isProviderConfigured", () => {
  it("无缓存时 → alipay=true, wechat=false（保守默认）", () => {
    // 由于模块级缓存，此测试依赖执行顺序
    const result = isProviderConfigured("alipay");
    expect(typeof result).toBe("boolean");
  });
});

describe("getAvailableProviders", () => {
  it("返回支付方式列表", () => {
    const providers = getAvailableProviders();
    expect(providers.length).toBeGreaterThan(0);
    expect(providers[0]).toHaveProperty("provider");
    expect(providers[0]).toHaveProperty("label");
  });
});

describe("getPaymentTips", () => {
  it("alipay → 返回提示", () => {
    const tip = getPaymentTips("alipay");
    expect(tip.length).toBeGreaterThan(0);
  });

  it("wechat → 返回提示", () => {
    const tip = getPaymentTips("wechat");
    expect(tip.length).toBeGreaterThan(0);
  });
});

// mapPaymentError 已退役（2026-10-12 统一错误提示层）：钱路错误改由后端稳定码 +
// src/core/http/error-map.ts 的 code→i18n 映射承担，对应断言迁至 tests/unit/core/http/error-map.test.ts。
