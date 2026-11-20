/**
 * 语言切换的 URL 归属
 * Locale → URL mapping for the language switcher
 *
 * @module core/i18n/navigation
 * @description 语言不能只存在于 Cookie 里：切换语言必须落到对应 URL，否则同一页面
 *              既是中文页又是英文页，canonical / 分享 / 收录会互相打架。
 *
 *              本项目的 URL 策略（2026-11-20 起）：
 *              - 中文：无前缀（/procurement）
 *              - 英文：/en 前缀（/en/procurement），独立根布局，`<html lang="en">`；
 *                但语言切换器**不再**跳 /en，而是像其他语言一样原地写 Cookie 翻译，
 *                /en 保留给搜索引擎与外部链接（SEO 入口站，不走切换器）
 *              - 其余语言（fr/ru/es/ar/pt）：暂无独立 URL，保持当前 URL + Cookie
 *
 *              返回值语义：null = 停留当前 URL（由 Cookie 驱动客户端切换）。
 */

import type { Locale } from "./types";

/** 有英文对应页的中文路径（仅用于 SEO 外链/调试；语言切换器不再使用） */
const EN_STATIC: Record<string, string> = {
  "/": "/en",
  "/procurement": "/en/procurement",
};

/** 公告详情：中文 /procurement/notice/:id ↔ 英文 /en/procurement/notice/:id */
const ZH_NOTICE = /^\/procurement\/notice\/(\d+)$/;

/** 当前是否处于英文站点（/en 或 /en/...） */
export function isEnglishPath(pathname: string): boolean {
  return pathname === "/en" || pathname.startsWith("/en/");
}

/** 去掉 /en 前缀，得到中文路径；非英文路径原样返回 */
export function stripEnglishPrefix(pathname: string): string {
  if (pathname === "/en") return "/";
  if (pathname.startsWith("/en/")) return pathname.slice(3) || "/";
  return pathname;
}

/** 中文路径 → 英文路径；无对应页返回 null（调用方回落到 /en） */
export function englishPathFor(zhPath: string): string | null {
  if (EN_STATIC[zhPath]) return EN_STATIC[zhPath];
  const notice = zhPath.match(ZH_NOTICE);
  if (notice) return `/en/procurement/notice/${notice[1]}`;
  return null;
}

/**
 * 切到目标语言应导航到的 URL。
 * null = 无需跳转（留在当前 URL，仅写 Cookie 让客户端切语言）。
 */
export function localeHref(pathname: string, target: Locale): string | null {
  if (target === "zh") {
    return isEnglishPath(pathname) ? stripEnglishPrefix(pathname) : null;
  }
  if (target === "en") {
    // 原地翻译（与 fr/ru/es/ar/pt 同策略）：不跳 /en，否则用户会从业务页被丢到
    // 只有几个落地页的英文 SEO 站；/en 仅供搜索引擎/外链直达。
    return null;
  }
  // fr / ru / es / ar / pt：没有独立 URL，回到中文路径后由 Cookie 生效
  return isEnglishPath(pathname) ? stripEnglishPrefix(pathname) : null;
}
