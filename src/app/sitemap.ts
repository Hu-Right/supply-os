/**
 * Sitemap — Next.js App Router 分片生成
 *
 * @module app/sitemap
 * @description 有效公告 37 万+，单文件 5 万上限已不够；用 generateSitemaps 拆成
 *              0~7 共 8 个公告分片（每片 5 万），第 8 片放静态页/国别/供应商。
 *              分片数据由 lib/services/seo/sitemap-sources 提供（单一事实源）。
 *              `/sitemap-index.xml` 由 app/sitemap-index.xml/route.ts 输出，robots 指向它。
 */
import type { MetadataRoute } from "next";
import {
  SITEMAP_NOTICE_PAGE_SIZE,
  SITEMAP_NOTICE_SHARDS,
  SITEMAP_STATIC_SHARD,
  fetchSitemapCountries,
  fetchSitemapNoticesPage,
  fetchSitemapSuppliers,
} from "@/lib/services/seo/sitemap-sources";
import { SITE_URL } from "@/lib/services/seo/site";

const BASE_URL = SITE_URL;

export const revalidate = 3600;

/** 固定 9 片：0~7 公告，8 静态/国别/供应商；DB 不可用时也能在构建期生成索引 */
export async function generateSitemaps() {
  return Array.from({ length: SITEMAP_NOTICE_SHARDS + 1 }, (_, id) => ({ id }));
}

function isoOrNull(v: Date | string | number | null): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** 静态页 + 实体页 + 英文入口 */
function staticPages(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/procurement`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/procurement/countries`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/procurement/industries`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/supplier`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/award-intelligence`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/training`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/membership`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/services`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/ecosystem`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/refund-policy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/account-cancellation`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/notice-source`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/complaint`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/en`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/en/procurement`, changeFrequency: "daily", priority: 0.7 },
  ];
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const shard = Number(await id);
  const now = new Date().toISOString();

  // 构建阶段无数据库：静态片照常输出，公告片留空（线上 ISR 再生成）
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return shard === SITEMAP_STATIC_SHARD ? staticPages() : [];
  }

  if (shard === SITEMAP_STATIC_SHARD) {
    const pages = staticPages();

    let countryPages: MetadataRoute.Sitemap = [];
    try {
      const countries = await fetchSitemapCountries();
      countryPages = countries.map((c) => ({
        url: `${BASE_URL}/procurement/country/${c.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
    } catch (err) {
      console.error("[sitemap] 国别段生成失败，已降级为空:", (err as Error).message);
    }

    let supplierPages: MetadataRoute.Sitemap = [];
    try {
      const rows = await fetchSitemapSuppliers();
      supplierPages = rows.map((row) => ({
        url: `${BASE_URL}/supplier/${row.id}`,
        lastModified: isoOrNull(row.addtime) ?? now,
        changeFrequency: "monthly" as const,
        priority: 0.5,
        alternates: {
          languages: {
            zh: `${BASE_URL}/supplier/${row.id}`,
            en: `${BASE_URL}/en/supplier/${row.id}`,
          },
        },
      }));
    } catch (err) {
      console.error("[sitemap] 供应商段生成失败，已降级为空:", (err as Error).message);
    }

    return [...pages, ...countryPages, ...supplierPages];
  }

  // 公告分片
  try {
    const rows = await fetchSitemapNoticesPage(shard * SITEMAP_NOTICE_PAGE_SIZE, SITEMAP_NOTICE_PAGE_SIZE);
    return rows.map((row) => ({
      url: `${BASE_URL}/procurement/notice/${row.id}`,
      lastModified: isoOrNull(row.create_time) ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error(`[sitemap] 公告分片 ${shard} 生成失败，已降级为空:`, (err as Error).message);
    return [];
  }
}
