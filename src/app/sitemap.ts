/**
 * Sitemap — Next.js App Router 原生生成
 *
 * @module app/sitemap
 * @description 替代旧的 scripts/prerender.ts + Playwright 预渲染方案。
 *              Next.js 在构建时或 ISR revalidate 时自动调用此函数生成 sitemap.xml。
 */
import type { MetadataRoute } from "next";

const BASE_URL = "https://osneosmart.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();

  // 静态页面
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/showroom`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/procurement`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/supplier`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/services`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/learning`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/membership`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/training`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/procurement/qualification`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  return staticPages;
}
