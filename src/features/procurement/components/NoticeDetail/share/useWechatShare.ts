"use client";

/**
 * 微信内置浏览器分享卡片（JS-SDK）
 * @module features/procurement/components/NoticeDetail/share/useWechatShare
 *
 * @description 微信内打开分享面板时：
 *   1. 拉取 `/api/wechat/jssdk` 签名（后端缓存 access_token/jsapi_ticket）；
 *   2. 加载 jweixin-1.6.0 并 wx.config；
 *   3. ready 后设置「发送给朋友 / 分享到朋友圈」的标题、摘要、链接、缩略图。
 *
 *   公众号未配置（后端返回 configured:false）或签名失败时静默降级：
 *   分享面板仍可用，「微信」渠道展示「点右上角」引导。
 *   微信不提供「直接调起好友列表」的 API，任何网页都只能引导用户点右上角。
 */
import { useEffect, useMemo, useState } from "react";

const WX_SDK_URL = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";

interface WxShareApi {
  config(options: Record<string, unknown>): void;
  ready(callback: () => void): void;
  updateAppMessageShareData(options: Record<string, unknown>): void;
  updateTimelineShareData(options: Record<string, unknown>): void;
}

interface JssdkSignature {
  configured?: boolean;
  appId?: string;
  timestamp?: number;
  nonceStr?: string;
  signature?: string;
}

function wxApi(): WxShareApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { wx?: WxShareApi }).wx ?? null;
}

export type WechatPlatform = "mobile" | "windows" | "mac";

/** 微信内置浏览器平台：手机 / Windows 微信 / Mac 微信（三者的「···」位置和可用动作不同） */
export function wechatPlatform(): WechatPlatform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (!/micromessenger/i.test(ua)) return null;
  if (/windowswechat/i.test(ua)) return "windows";
  if (/macwechat/i.test(ua)) return "mac";
  return "mobile";
}

export function isWechatBrowser(): boolean {
  return wechatPlatform() !== null;
}

let sdkPromise: Promise<void> | null = null;

function loadWxSdk(): Promise<void> {
  if (wxApi()) return Promise.resolve();
  sdkPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = WX_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("WX_SDK_LOAD_FAILED"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export interface UseWechatShareOptions {
  /** 分享面板打开时才初始化（避免列表页无谓拉签名） */
  active: boolean;
  title: string;
  desc?: string;
  /** 分享出去的规范深链（公告详情页） */
  link: string;
  imgUrl: string;
}

export interface UseWechatShareResult {
  /** 当前是否微信内置浏览器（决定「微信」渠道弹引导还是复制） */
  isWechat: boolean;
  /** 微信平台：手机 / Windows / Mac（引导文案按平台区分） */
  platform: WechatPlatform | null;
  /** JS-SDK 是否已配置成功（决定引导文案：卡片可自定义 / 通用卡片） */
  configured: boolean;
}

export function useWechatShare({ active, title, desc, link, imgUrl }: UseWechatShareOptions): UseWechatShareResult {
  const platform = useMemo<WechatPlatform | null>(() => {
    const detected = wechatPlatform();
    if (detected) return detected;
    // 仅开发态：?wx_debug=1 可在桌面浏览器预览「点右上角」引导层（生产不生效）
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      if (new URLSearchParams(window.location.search).get("wx_debug") === "1") return "mobile";
    }
    return null;
  }, []);
  const isWechat = platform !== null;
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    if (!active || !isWechat) return;
    // 桌面预览（?wx_debug=1）只展示引导层，不加载微信 SDK
    if (!isWechatBrowser()) return;
    let cancelled = false;

    (async () => {
      try {
        const pageUrl = window.location.href.split("#")[0];
        const res = await fetch(`/api/wechat/jssdk?url=${encodeURIComponent(pageUrl)}`, { cache: "no-store" });
        const signature = (await res.json()) as JssdkSignature;
        if (cancelled || !signature.configured || !signature.appId) return;

        await loadWxSdk();
        if (cancelled) return;
        const wx = wxApi();
        if (!wx) return;

        wx.config({
          debug: false,
          appId: signature.appId,
          timestamp: signature.timestamp,
          nonceStr: signature.nonceStr,
          signature: signature.signature,
          jsApiList: ["updateAppMessageShareData", "updateTimelineShareData"],
        });

        wx.ready(() => {
          if (cancelled) return;
          setConfigured(true);
          wx.updateAppMessageShareData({ title, desc: desc || title, link, imgUrl });
          wx.updateTimelineShareData({ title, link, imgUrl });
        });
      } catch {
        // 签名/加载失败不阻断面板：引导层仍然可用
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, isWechat, title, desc, link, imgUrl]);

  return { isWechat, platform, configured };
}
