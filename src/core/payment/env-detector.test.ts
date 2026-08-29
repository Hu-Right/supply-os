import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectPlatformEnv, isMobile, isDesktop, mapPaymentError } from "./env-detector";
import { ApiError } from "@/core/http/api-client";

describe("detectPlatformEnv", () => {
  const originalUA = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { value: originalUA, configurable: true });
    delete (window as any).__SUPPLY_OS_APP__;
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
    (window as any).__SUPPLY_OS_APP__ = true;
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

describe("mapPaymentError", () => {
  it("ApiError 500 → 系统繁忙", () => {
    expect(mapPaymentError(new ApiError(500, "Internal"))).toBe("系统繁忙，请稍后重试");
  });

  it("ApiError 503 → 支付通道不可用", () => {
    expect(mapPaymentError(new ApiError(503, "Unavailable"))).toContain("支付通道");
  });

  it("ApiError 401 → 请先登录", () => {
    expect(mapPaymentError(new ApiError(401, "Auth"))).toBe("请先登录后再尝试支付");
  });

  it("ApiError 404 → 课程不存在", () => {
    expect(mapPaymentError(new ApiError(404, "Not found"))).toContain("课程不存在");
  });

  it("含 PLAN_NOT_FOUND → 未找到套餐", () => {
    expect(mapPaymentError(new Error("PLAN_NOT_FOUND"))).toContain("套餐");
  });

  it("含 FREE_PLAN_NO_PAYMENT → 免费无需支付", () => {
    expect(mapPaymentError(new Error("FREE_PLAN_NO_PAYMENT_REQUIRED"))).toBe("免费套餐无需支付");
  });

  it("未知错误 → 兜底文案", () => {
    expect(mapPaymentError(new Error("random error"))).toBe("支付创建失败，请稍后重试或更换支付方式");
  });

  it("非 Error 对象 → 兜底", () => {
    expect(mapPaymentError("string error")).toBe("支付创建失败，请稍后重试或更换支付方式");
  });
});
