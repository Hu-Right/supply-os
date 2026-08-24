/**
 * 平台环境检测
 * Platform Environment Detection
 *
 * @module core/payment/env-detector
 * @description 检测当前运行平台（微信/浏览器/App），提供支付方式可用性判断。
 *              Detect current platform (WeChat/Browser/App), provide payment method availability.
 */

import type { PlatformEnv } from "@/types/payment";
import { api, ApiError } from "@/core/http";

/** 支付提供商配置状态（精简，仅前端 UI 决策所需字段） */
export interface PaymentConfigStatus {
  wechat: boolean;
  alipay: boolean;
}

let _configCache: PaymentConfigStatus | null = null;

/**
 * 从后端获取支付通道配置状态（带 60s 内存缓存）
 * Fetch payment channel config status from backend (60s in-memory cache)
 */
export async function fetchPaymentConfigStatus(): Promise<PaymentConfigStatus> {
  if (_configCache) return _configCache;
  try {
    // #10 收口：统一请求层（指标采集），错误由下方 catch 保守回退
    const data = await api<{ providers?: { wechat?: { configured?: boolean }; alipay?: { configured?: boolean } } }>(
      "/api/payment/config-status",
    );
    _configCache = {
      wechat: Boolean(data?.providers?.wechat?.configured),
      alipay: Boolean(data?.providers?.alipay?.configured),
    };
    return _configCache;
  } catch {
    // 网络异常时回退：微信不可用、支付宝可用（保守策略）
    return { wechat: false, alipay: true };
  }
}

/**
 * 同步判断支付提供商是否可用（缓存命中时立即返回，否则返回保守默认值）
 * Synchronously check if a payment provider is available (uses cache if present)
 */
export function isProviderConfigured(provider: "alipay" | "wechat"): boolean {
  if (!_configCache) return provider === "alipay";
  return _configCache[provider];
}

/**
 * 检测当前运行平台环境
 * Detect current platform environment
 *
 * - "wechat": 微信内置浏览器
 * - "browser": 普通浏览器（移动端/PC端）
 * - "app": 未来 App WebView（预留）
 */
export function detectPlatformEnv(): PlatformEnv {
  // 先检查是否有自定义 App 标识（未来 App WebView 注入）
  if (typeof window !== "undefined") {
    const win = window as any;
    if (win.__SUPPLY_OS_APP__ || navigator.userAgent.includes("SupplyOSApp")) {
      return "app";
    }
  }

  if (typeof navigator === "undefined") return "browser";

  const ua = navigator.userAgent.toLowerCase();

  // 微信内置浏览器检测
  if (ua.includes("micromessenger")) {
    return "wechat";
  }

  return "browser";
}

/**
 * 是否为移动端设备
 * Is mobile device
 */
export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

/**
 * 是否为桌面端
 * Is desktop device
 */
export function isDesktop(): boolean {
  return !isMobile();
}

/**
 * 获取当前环境支持的支付方式
 * Get available payment providers for current environment
 *
 * - 微信内：微信屏蔽支付宝，只展示微信支付
 * - 非微信：支付宝 + 微信支付都可
 */
export function getAvailableProviders(): Array<{
  provider: "alipay" | "wechat";
  label: string;
  icon: string;
  recommended: boolean;
}> {
  const env = detectPlatformEnv();

  if (env === "wechat") {
    return [
      {
        provider: "wechat",
        label: "微信支付",
        icon: "💚",
        recommended: true,
      },
    ];
  }

  if (env === "app") {
    // App 内由原生层处理，这里做降级返回
    return [
      { provider: "alipay", label: "支付宝", icon: "💙", recommended: false },
      { provider: "wechat", label: "微信支付", icon: "💚", recommended: true },
    ];
  }

  return [
    { provider: "alipay", label: "支付宝", icon: "💙", recommended: false },
    { provider: "wechat", label: "微信支付", icon: "💚", recommended: isMobile() },
  ];
}

/**
 * 获取支付方式的中文提示文案
 * Get payment tips in Chinese for current platform
 */
export function getPaymentTips(provider: "alipay" | "wechat"): string {
  const env = detectPlatformEnv();
  const mobile = isMobile();

  if (provider === "alipay") {
    if (env === "wechat") {
      return "微信内无法使用支付宝，请在浏览器中打开此页面";
    }
    if (mobile) {
      return "将自动唤起支付宝 App，如未安装请选择其他方式";
    }
    return "请使用支付宝 App 扫描二维码完成支付";
  }

  // wechat
  if (env === "wechat") {
    return "点击下方按钮，在微信内完成支付";
  }
  if (mobile) {
    return "将跳转至微信完成支付";
  }
  return "请使用微信 App 扫描二维码完成支付";
}

/**
 * 将技术性支付错误映射为用户友好的中文提示
 * Map technical payment errors to user-friendly Chinese messages
 */
export function mapPaymentError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // 优先按 HTTP 状态码判断（后端已知错误均通过 sendError 返回结构化响应）
  if (err instanceof ApiError) {
    if (err.status === 500) return "系统繁忙，请稍后重试";
    if (err.status === 503) return "支付通道暂时不可用，请稍后重试或联系我们";
    if (err.status === 404) return "课程不存在或已下架，请刷新页面后重试";
    if (err.status === 401) return "请先登录后再尝试支付";
  }
  if (message.includes("Unsupported payment provider") || message === "PAYMENT_PROVIDER_UNAVAILABLE") {
    return "当前支付方式暂未开通，请选择支付宝或联系管理员";
  }
  if (message.includes("支付通道") || message.includes("系统繁忙")) {
    return message.includes("系统繁忙") ? "系统繁忙，请稍后重试" : "支付通道暂时不可用，请稍后重试或联系我们";
  }
  if (message.includes("课程不存在") || message.includes("COURSE_NOT_FOUND")) {
    return "课程不存在或已下架，请刷新页面后重试";
  }
  if (message.includes("课程价格") || message.includes("COURSE_PRICE_INVALID")) {
    return "课程价格配置异常，请联系管理员";
  }
  if (message.includes("二维码") || message.includes("当面付") || message.includes("PAYMENT_QR_CODE_MISSING")) {
    return "支付二维码生成失败，请确认已开通「当面付」产品后重试";
  }
  if (message.includes("支付方式暂未开通") || message.includes("TRAINING_PROVIDER_UNAVAILABLE")) {
    return "当前支付方式暂未开通，请选择其他支付方式或联系我们";
  }
  if (message.includes("PLAN_NOT_FOUND")) {
    return "未找到对应的套餐方案，请刷新后重试";
  }
  if (message.includes("USER_AND_PLAN_REQUIRED")) {
    return "请先登录后再尝试支付";
  }
  if (message.includes("FREE_PLAN_NO_PAYMENT_REQUIRED")) {
    return "免费套餐无需支付";
  }
  // 兜底：打印原始错误便于排查
  console.warn("[mapPaymentError] 未匹配的错误消息:", message);
  return "支付创建失败，请稍后重试或更换支付方式";
}
