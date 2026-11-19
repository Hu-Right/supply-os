"use client";

/**
 * 微信内分享引导层
 * @module features/procurement/components/NoticeDetail/share/WechatGuide
 *
 * @description 微信内置浏览器里没有「一键发送给好友」的 JS API：分享入口固定在
 *              微信自己的界面里——手机在顶部导航栏右上角，Windows/Mac 微信在
 *              窗口右上角。本组件盖在整页之上，用一颗放大的「···」作为参照物，
 *              并按平台给出不同文案。
 *
 *              用 portal 挂到 body：分享面板本身是 Radix 弹窗，页面头部有
 *              sticky z-50，普通 fixed 节点会被页头盖住/裁切。
 */
import { createPortal } from "react-dom";
import { ArrowUpRight } from "lucide-react";
import type { WechatPlatform } from "./useWechatShare";

export function WechatGuide({
  open,
  onClose,
  customized,
  platform,
}: {
  open: boolean;
  onClose: () => void;
  /** JS-SDK 已生效：卡片标题/摘要/图片可自定义 */
  customized: boolean;
  /** mobile=手机微信；windows/mac=电脑微信（菜单在窗口右上角） */
  platform: WechatPlatform | null;
}) {
  if (!open) return null;

  const desktop = platform === "windows" || platform === "mac";
  const title = desktop ? "点微信窗口右上角的 ···" : "点屏幕右上角的 ···";
  const action = desktop ? "发送给朋友 / 复制链接" : "发送给朋友 / 分享到朋友圈";
  const where = desktop ? "按钮在微信窗口最上方，不在网页里" : "按钮在微信顶部导航栏，不在网页里";

  const panel = (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/85 px-5 pb-8 pt-5"
      role="dialog"
      aria-modal="true"
      aria-label="微信分享指引"
      data-testid="wechat-share-guide"
      onClick={onClose}
    >
      {/* 用一颗放大的「···」当参照物：即使微信原生界面遮住页面顶部，
          用户也能看到这个按钮长什么样、该去哪里找 */}
      <div
        className="flex flex-1 flex-col items-center justify-center text-center text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-14 w-28 items-center justify-center rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
          <span className="ml-[0.3em] text-3xl font-black leading-none tracking-[0.3em] text-slate-900">···</span>
        </div>
        <p className="mt-4 text-base font-black">{title}</p>
        <div className="mt-1.5 flex items-center gap-1 text-teal-300">
          <ArrowUpRight className="h-5 w-5" />
          <span className="text-sm font-bold">点它 → {action}</span>
        </div>
        <p className="mt-3 text-xs text-white/60">{where}</p>
        <p className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-xs leading-relaxed text-white/70">
          {customized
            ? "卡片已自动带上这条公告的标题、摘要与图片"
            : "当前为通用卡片；接入公众号后可自定义标题、摘要与图片"}
        </p>
      </div>

      <div
        className="rounded-2xl bg-white p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm font-bold text-slate-800">为什么不能一键发送？</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          微信不开放“网页直接调起好友列表”的能力，手机和电脑版都只能引导用户点微信界面里的分享菜单。
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-lg bg-teal-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-teal-700"
        >
          知道了
        </button>
      </div>
    </div>
  );

  // SSR（首帧）直接内联；客户端挂到 body，避免被页头 sticky 层盖住
  if (typeof document === "undefined") return panel;
  return createPortal(panel, document.body);
}
