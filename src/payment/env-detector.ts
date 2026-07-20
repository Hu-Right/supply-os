import type { PlatformEnv } from "./types";

/**
 * 检测当前运行平台环境：
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
 */
export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

/**
 * 是否为桌面端
 */
export function isDesktop(): boolean {
  return !isMobile();
}

/**
 * 获取当前环境支持的支付方式
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
 * 获取支付方式的中文提示文案（用于各种平台兼容说明）
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
