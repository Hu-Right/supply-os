import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectPlatformEnv,
  isMobile,
  isDesktop,
  getAvailableProviders,
  getPaymentTips,
} from "@/core/payment/env-detector";

describe("detectPlatformEnv", () => {
  const originalUA = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { value: originalUA, writable: true });
    delete (window as any).__SUPPLY_OS_APP__;
  });

  it('returns "browser" for standard desktop UA', () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      writable: true,
    });
    expect(detectPlatformEnv()).toBe("browser");
  });

  it('returns "wechat" for WeChat UA', () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 MicroMessenger/8.0.0",
      writable: true,
    });
    expect(detectPlatformEnv()).toBe("wechat");
  });

  it('returns "app" when __SUPPLY_OS_APP__ flag is set', () => {
    (window as any).__SUPPLY_OS_APP__ = true;
    expect(detectPlatformEnv()).toBe("app");
  });
});

describe("isMobile / isDesktop", () => {
  const originalUA = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { value: originalUA, writable: true });
  });

  it("returns true for mobile UA", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15",
      writable: true,
    });
    expect(isMobile()).toBe(true);
    expect(isDesktop()).toBe(false);
  });

  it("returns false for desktop UA", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      writable: true,
    });
    expect(isMobile()).toBe(false);
    expect(isDesktop()).toBe(true);
  });
});

describe("getAvailableProviders", () => {
  const originalUA = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { value: originalUA, writable: true });
    delete (window as any).__SUPPLY_OS_APP__;
  });

  it("returns only wechat in WeChat environment", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 MicroMessenger/8.0.0",
      writable: true,
    });
    const providers = getAvailableProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].provider).toBe("wechat");
    expect(providers[0].recommended).toBe(true);
  });

  it("returns both providers in browser environment", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      writable: true,
    });
    const providers = getAvailableProviders();
    expect(providers).toHaveLength(2);
    expect(providers.map((p) => p.provider)).toEqual(["alipay", "wechat"]);
  });
});

describe("getPaymentTips", () => {
  const originalUA = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { value: originalUA, writable: true });
  });

  it("returns block message for alipay in WeChat", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 MicroMessenger/8.0.0",
      writable: true,
    });
    const tip = getPaymentTips("alipay");
    expect(tip).toContain("微信内无法使用支付宝");
  });

  it("returns QR scan message for wechat on desktop", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      writable: true,
    });
    const tip = getPaymentTips("wechat");
    expect(tip).toContain("扫描");
  });

  it("returns mobile tip for alipay on mobile", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Chrome/120.0.0.0 Mobile",
      writable: true,
    });
    const tip = getPaymentTips("alipay");
    expect(tip).toContain("唤起");
  });

  it("returns mobile tip for wechat on mobile", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Chrome/120.0.0.0 Mobile",
      writable: true,
    });
    const tip = getPaymentTips("wechat");
    expect(tip).toContain("跳转");
  });

  it("returns QR scan message for alipay on desktop", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      writable: true,
    });
    const tip = getPaymentTips("alipay");
    expect(tip).toContain("扫描");
  });

  it("returns wechat in-wechat tip", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 MicroMessenger/8.0.0",
      writable: true,
    });
    const tip = getPaymentTips("wechat");
    expect(tip).toContain("微信内");
  });
});
