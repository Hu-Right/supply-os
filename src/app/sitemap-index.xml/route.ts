/**
 * /sitemap-index.xml — sitemap index
 *
 * @description `app/sitemap.ts` 用 generateSitemaps 拆成 /sitemap/{id}.xml；
 *              本路由提供标准 sitemapindex，robots 指向 /sitemap-index.xml。
 *              （不能用 /sitemap.xml：Next 的 sitemap metadata 路由已占用该路径。）
 */
import { SITE_URL } from "@/lib/services/seo/site";
import { SITEMAP_NOTICE_SHARDS } from "@/lib/services/seo/sitemap-sources";

export const revalidate = 3600;

export async function GET() {
  const ids = Array.from({ length: SITEMAP_NOTICE_SHARDS + 1 }, (_, i) => i);
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...ids.map((id) => `<sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc></sitemap>`),
    "</sitemapindex>",
  ].join("");
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
