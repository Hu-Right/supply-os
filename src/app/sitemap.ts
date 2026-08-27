/**
 * Sitemap — Next.js App Router 动态生成
 *
 * @module app/sitemap
 * @description 替代旧的 scripts/prerender.ts + Playwright 预渲染方案。
 *              Next.js 在构建时或 ISR revalidate 时自动调用此函数生成 sitemap.xml。
 *              动态从数据库获取公告和供应商数据，覆盖数千页面。
 */
import type { MetadataRoute } from "next";

const BASE_URL = "https://osneosmart.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();

  // ── 静态页面 ──
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/showroom`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/procurement`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/supplier`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/training`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/membership`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/services`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/learning`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/procurement/qualification`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  // ── 动态页面：从数据库获取公告列表 ──
  let noticePages: MetadataRoute.Sitemap = [];
  let supplierPages: MetadataRoute.Sitemap = [];

  try {
    const { getPool } = await import("@/lib/db/pool");
    const pool = getPool();

    // 采购公告（最多 5000 条）
    const [noticeRows] = await pool.query(
      "SELECT id, updated_at FROM notices WHERE status = 'active' ORDER BY updated_at DESC LIMIT 5000"
    );
    noticePages = (noticeRows as Array<{ id: number; updated_at: string | Date }>).map((row) => ({
      url: `${BASE_URL}/procurement?notice_id=${row.id}`,
      lastModified: new Date(row.updated_at).toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    // 供应商目录（最多 2000 条）
    const [supplierRows] = await pool.query(
      "SELECT id, updated_at FROM suppliers WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 2000"
    );
    supplierPages = (supplierRows as Array<{ id: number; updated_at: string | Date }>).map((row) => ({
      url: `${BASE_URL}/supplier?supplier_id=${row.id}`,
      lastModified: new Date(row.updated_at).toISOString(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // 数据库不可用时降级为仅静态页面（构建时或 CI 环境）
    console.warn("[sitemap] DB unavailable, generating static-only sitemap");
  }

  return [...staticPages, ...noticePages, ...supplierPages];
}
