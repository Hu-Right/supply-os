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
