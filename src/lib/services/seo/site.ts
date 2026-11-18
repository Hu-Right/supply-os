/**
 * 站点 URL 单一事实源
 * Site URL single source of truth
 *
 * @module lib/services/seo/site
 * @description robots.ts / sitemap.ts / 页面 canonical 均引用本模块，
 *              避免 9+ 处硬编码 https://osneosmart.com 导致换域名时遗漏。
 */

export const SITE_URL = process.env.SITE_URL || "https://osneosmart.com";

/** 拼接绝对 URL（path 以 / 开头） */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * 全站默认分享卡（OpenGraph / Twitter）。
 *
 * 单一事实源：所有页面的 openGraph 都是「整块替换」父级配置，页面一旦自己写了
 * openGraph 就会丢掉根 layout 的 images —— 因此每页显式引用本常量，
 * 否则分享卡片没有图（2026-11-18 前 /supplier、/training 等均无 og:image）。
 * 必须用位图：微信/Twitter/Facebook 不渲染 SVG。
 */
export const DEFAULT_OG_IMAGE = {
  url: "/images/og/og-default.jpg",
  width: 1200,
  height: 630,
  alt: "云境·国际采购平台 — 全球政府采购情报",
} as const;
