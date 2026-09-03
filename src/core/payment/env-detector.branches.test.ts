/**
 * env-detector 分支覆盖补全（架构评估 P0-T1 续）
 *
 * 覆盖：配置缓存命中/异常回退、平台化支付方式列表（wechat/app）、
 * 分平台支付提示文案、mapPaymentError 的钱路错误码映射分支。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/core/http", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { mapPaymentError, detectPlatformEnv, isMobile, fetchPaymentConfigStatus, isProviderConfigured, getAvailableProviders, getPaymentTips } from "./env-detector";
import { api, ApiError } from "@/core/http";

const originalUA = navigator.userAgent;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  Object.defineProperty(navigator, "userAgent", { value: originalUA, configurable: true });
  vi.unstubAllGlobals();
});

function stubUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

describe("fetchPaymentConfigStatus — 缓存与异常回退", () => {
  it("api 失败 → 保守回退：wechat=false, alipay=true", async () => {
    vi.mocked(api).mockRejectedValue(new Error("network down"));
    const status = await fetchPaymentConfigStatus();
    expect(status).toEqual({ wechat: false, alipay: true });
  });

  it("缓存命中后 isProviderConfigured 读取缓存值", async () => {
    vi.mocked(api).mockResolvedValue({ providers: { wechat: { configured: true }, alipay: { configured: false } } });
    await fetchPaymentConfigStatus();
    expect(isProviderConfigured("wechat")).toBe(true);
    expect(isProviderConfigured("alipay")).toBe(false);
  });
});

describe("getAvailableProviders — 平台化列表", () => {
  it("微信环境 → 仅微信支付（recommended）", () => {
    stubUA("Mozilla/5.0 MicroMessenger/7.0");
    expect(detectPlatformEnv()).toBe("wechat");
    const methods = getAvailableProviders();
    expect(methods).toHaveLength(1);
    expect(methods[0]).toMatchObject({ provider: "wechat", recommended: true });
  });

  it("App 环境 → 降级返回双通道", () => {
    (window as any).__SUPPLY_OS_APP__ = true;
    try {
      const methods = getAvailableProviders();
      expect(methods.map((m: { provider: string }) => m.provider)).toEqual(["alipay", "wechat"]);
    } finally {
      delete (window as any).__SUPPLY_OS_APP__;
    }
  });

  it("浏览器环境 → 双通道，桌面端微信非推荐", () => {
    stubUA("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0");
    const methods = getAvailableProviders();
    expect(methods.map((m: { provider: string }) => m.provider)).toEqual(["alipay", "wechat"]);
    expect(methods[1].recommended).toBe(false);
    expect(methods[1].recommended).toBe(false);
  });
});

describe("getPaymentTips — 分平台文案", () => {
  it("alipay × 微信环境 → 引导用浏览器打开", () => {
    stubUA("Mozilla/5.0 MicroMessenger/7.0");
    expect(getPaymentTips("alipay")).toBe("微信内无法使用支付宝，请在浏览器中打开此页面");
  });

  it("alipay × 移动端 → 唤起 App 提示", () => {
    stubUA("Mozilla/5.0 iPhone Safari");
    expect(isMobile()).toBe(true);
    expect(getPaymentTips("alipay")).toBe("将自动唤起支付宝 App，如未安装请选择其他方式");
  });

  it("wechat × 微信环境 → 微信内支付提示", () => {
    stubUA("Mozilla/5.0 MicroMessenger/7.0");
    expect(getPaymentTips("wechat")).toBe("点击下方按钮，在微信内完成支付");
  });

  it("wechat × 移动端浏览器 → 跳转微信提示", () => {
    stubUA("Mozilla/5.0 Android Chrome Mobile");
    expect(getPaymentTips("wechat")).toBe("将跳转至微信完成支付");
  });
});

describe("mapPaymentError — 钱路错误码映射", () => {
  it("400 未匹配的业务错误 → 保留原始消息便于排查", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = new ApiError(400, "自定义业务错误 XYZ");
    expect(mapPaymentError(err)).toBe("自定义业务错误 XYZ");
    expect(warnSpy).toHaveBeenCalledWith("[mapPaymentError] 未匹配的 400 错误:", "自定义业务错误 XYZ");
    warnSpy.mockRestore();
  });

  it("学员信息校验失败 → 引导检查学员信息", () => {
    expect(mapPaymentError(new ApiError(400, "学员信息不完整"))).toBe("学员信息校验失败，请检查后重试");
  });

  it("期次异常 → 引导刷新页面", () => {
    expect(mapPaymentError(new ApiError(400, "该期次 schedule 已不可用"))).toBe("所选期次已不可用，请刷新页面后重试");
  });

  it("SINGLE_FIRST_PURCHASE_ONLY → 首单特惠提示", () => {
    expect(mapPaymentError(new Error("SINGLE_FIRST_PURCHASE_ONLY"))).toBe("首单特惠仅限首次购买，请选择标准单次解锁");
  });

  it("AMOUNT_MISMATCH / AMOUNT_INVALID → 金额异常提示", () => {
    expect(mapPaymentError(new Error("AMOUNT_MISMATCH"))).toBe("支付金额异常，请联系客服处理");
    expect(mapPaymentError(new Error("AMOUNT_INVALID"))).toBe("支付金额异常，请联系客服处理");
  });

  it("SIGN_VERIFY_FAILED → 验证失败提示", () => {
    expect(mapPaymentError(new Error("SIGN_VERIFY_FAILED"))).toBe("支付验证失败，请重试或更换支付方式");
  });

  it("SCHEDULE_CAPACITY_EXCEEDED → 名额已满提示", () => {
    expect(mapPaymentError(new Error("SCHEDULE_CAPACITY_EXCEEDED"))).toBe("所选期次名额已满，请选择其他期次");
  });

  it("ORDER_NOT_FOUND → 订单不存在提示", () => {
    expect(mapPaymentError(new Error("ORDER_NOT_FOUND"))).toBe("订单不存在或已过期，请重新创建");
  });
});
