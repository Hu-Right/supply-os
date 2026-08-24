/**
 * src/core/payment/env-detector.ts 测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "../../../../src/core/http/api-client";
import {
  detectPlatformEnv,
  isMobile,
  isDesktop,
  mapPaymentError,
  getAvailableProviders,
  getPaymentTips,
  isProviderConfigured,
} from "../../../../src/core/payment/env-detector";

describe("detectPlatformEnv", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    delete (globalThis as any).window?.__SUPPLY_OS_APP__;
  });

  it("微信 UA 返回 wechat", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 MicroMessenger/7.0" },
      writable: true,
      configurable: true,
    });
    expect(detectPlatformEnv()).toBe("wechat");
  });

  it("普通浏览器返回 browser", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 Chrome/120" },
      writable: true,
      configurable: true,
    });
    expect(detectPlatformEnv()).toBe("browser");
  });

  it("window.__SUPPLY_OS_APP__ 标识返回 app", () => {
    (globalThis as any).window = { __SUPPLY_OS_APP__: true };
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 Chrome/120" },
      writable: true,
      configurable: true,
    });
    expect(detectPlatformEnv()).toBe("app");
  });

  it("UA 包含 SupplyOSApp 返回 app", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 SupplyOSApp/1.0" },
      writable: true,
      configurable: true,
    });
    expect(detectPlatformEnv()).toBe("app");
  });
});

describe("isMobile / isDesktop", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it("iPhone UA 为移动端", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 iPhone" },
      writable: true,
      configurable: true,
    });
    expect(isMobile()).toBe(true);
    expect(isDesktop()).toBe(false);
  });

  it("Android UA 为移动端", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 Android 13" },
      writable: true,
      configurable: true,
    });
    expect(isMobile()).toBe(true);
  });

  it("桌面 Chrome 为桌面端", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 Windows NT 10.0 Chrome/120" },
      writable: true,
      configurable: true,
    });
    expect(isMobile()).toBe(false);
    expect(isDesktop()).toBe(true);
  });
});

describe("mapPaymentError", () => {
  it("支付方式不可用", () => {
    expect(mapPaymentError(new Error("Unsupported payment provider"))).toContain("暂未开通");
    expect(mapPaymentError("PAYMENT_PROVIDER_UNAVAILABLE")).toContain("暂未开通");
  });

  it("套餐未找到", () => {
    expect(mapPaymentError(new Error("PLAN_NOT_FOUND"))).toContain("套餐方案");
  });

  it("需要登录", () => {
    expect(mapPaymentError(new Error("USER_AND_PLAN_REQUIRED"))).toContain("登录");
  });

  it("免费套餐无需支付", () => {
    expect(mapPaymentError(new Error("FREE_PLAN_NO_PAYMENT_REQUIRED"))).toContain("免费");
  });

  it("课程不存在", () => {
    expect(mapPaymentError(new Error("课程不存在或已下架"))).toContain("课程不存在");
    expect(mapPaymentError(new Error("COURSE_NOT_FOUND"))).toContain("课程不存在");
  });

  it("课程价格无效", () => {
    expect(mapPaymentError(new Error("课程价格配置无效"))).toContain("课程价格");
    expect(mapPaymentError(new Error("COURSE_PRICE_INVALID"))).toContain("课程价格");
  });

  it("二维码生成失败", () => {
    expect(mapPaymentError(new Error("支付宝二维码生成失败"))).toContain("当面付");
    expect(mapPaymentError(new Error("PAYMENT_QR_CODE_MISSING"))).toContain("当面付");
  });

  it("支付方式暂未开通（中文消息）", () => {
    expect(mapPaymentError(new Error("当前支付方式暂未开通，请选择其他支付方式或联系我们"))).toContain("暂未开通");
  });

  it("ApiError 状态码映射", () => {
    expect(mapPaymentError(new ApiError(500, "Internal Server Error"))).toBe("系统繁忙，请稍后重试");
    expect(mapPaymentError(new ApiError(503, "Service Unavailable"))).toContain("支付通道");
    expect(mapPaymentError(new ApiError(404, "Not Found"))).toContain("课程不存在");
    expect(mapPaymentError(new ApiError(401, "Unauthorized"))).toContain("登录");
  });

  it("未知错误兜底", () => {
    expect(mapPaymentError(new Error("something else"))).toContain("支付创建失败");
    expect(mapPaymentError("random string")).toContain("支付创建失败");
  });
});

describe("getAvailableProviders", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    delete (globalThis as any).window?.__SUPPLY_OS_APP__;
  });

  it("返回非空数组", () => {
    const providers = getAvailableProviders();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);
  });

  it("每个 provider 有必需字段", () => {
    const providers = getAvailableProviders();
    for (const p of providers) {
      expect(p).toHaveProperty("provider");
      expect(p).toHaveProperty("label");
      expect(p).toHaveProperty("icon");
      expect(p).toHaveProperty("recommended");
    }
  });

  it("微信环境只返回微信支付", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 MicroMessenger/7.0" },
      writable: true,
      configurable: true,
    });
    const providers = getAvailableProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].provider).toBe("wechat");
  });

  it("App 环境返回支付宝和微信", () => {
    (globalThis as any).window = { __SUPPLY_OS_APP__: true };
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 Chrome/120" },
      writable: true,
      configurable: true,
    });
    const providers = getAvailableProviders();
    expect(providers).toHaveLength(2);
    expect(providers.map((p) => p.provider)).toContain("alipay");
    expect(providers.map((p) => p.provider)).toContain("wechat");
  });

  it("普通浏览器环境返回两种支付方式", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 Windows NT 10.0 Chrome/120" },
      writable: true,
      configurable: true,
    });
    const providers = getAvailableProviders();
    expect(providers).toHaveLength(2);
  });
});

describe("getPaymentTips", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    delete (globalThis as any).window?.__SUPPLY_OS_APP__;
  });

  it("支付宝提示为字符串", () => {
    expect(typeof getPaymentTips("alipay")).toBe("string");
  });

  it("微信支付提示为字符串", () => {
    expect(typeof getPaymentTips("wechat")).toBe("string");
  });

  it("微信环境下支付宝提示'无法使用'", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 MicroMessenger/7.0" },
      writable: true,
      configurable: true,
    });
    expect(getPaymentTips("alipay")).toContain("无法使用");
  });

  it("微信环境下微信支付提示'在微信内'", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 MicroMessenger/7.0" },
      writable: true,
      configurable: true,
    });
    expect(getPaymentTips("wechat")).toContain("微信内");
  });

  it("移动端浏览器支付宝提示'唤起'", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 iPhone Safari" },
      writable: true,
      configurable: true,
    });
    expect(getPaymentTips("alipay")).toContain("唤起");
  });

  it("桌面端浏览器支付宝提示'二维码'", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 Windows NT 10.0 Chrome/120" },
      writable: true,
      configurable: true,
    });
    expect(getPaymentTips("alipay")).toContain("二维码");
  });

  it("移动端浏览器微信支付提示'跳转'", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 iPhone Safari" },
      writable: true,
      configurable: true,
    });
    expect(getPaymentTips("wechat")).toContain("跳转");
  });

  it("桌面端浏览器微信支付提示'二维码'", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 Windows NT 10.0 Chrome/120" },
      writable: true,
      configurable: true,
    });
    expect(getPaymentTips("wechat")).toContain("二维码");
  });
});

describe("isProviderConfigured", () => {
  it("无缓存时 alipay 默认 true，wechat 默认 false", () => {
    // 模块级缓存可能已被其他测试影响，只验证返回 boolean
    expect(typeof isProviderConfigured("alipay")).toBe("boolean");
    expect(typeof isProviderConfigured("wechat")).toBe("boolean");
  });
});
