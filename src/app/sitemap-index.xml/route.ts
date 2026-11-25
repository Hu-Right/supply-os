/**
 * /sitemap-index.xml — sitemap 索引
 *
 * @description 2026-11-25 起分片清单来自预生成快照的 manifest
 *              （runtime/seo/sitemap/manifest.json）：
 *              公告分片 0..N-1 + 固定静态片 /sitemap/static.xml。
 *              manifest 缺失（首次部署）时回退旧口径（8 片公告 + 1 片静态），
 *              保证索引始终可解析。
 */
import { SITE_URL } from "@/lib/services/seo/site";
import { readSitemapManifest } from "@/lib/services/seo/sitemap-snapshot";

export const revalidate = 600;

const FALLBACK_NOTICE_SHARDS = 8;

export async function GET() {
  const manifest = await readSitemapManifest();
  const noticeShards = manifest?.noticeShards ?? FALLBACK_NOTICE_SHARDS;
  const ids = Array.from({ length: noticeShards }, (_, i) => i);
  const lastmod = manifest?.generatedAt;

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...ids.map(
      (id) =>
        `<sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc>${
          lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
        }</sitemap>`,
    ),
    `<sitemap><loc>${SITE_URL}/sitemap/static.xml</loc>${
      lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
    }</sitemap>`,
    "</sitemapindex>",
  ].join("");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
    },
  });
}
