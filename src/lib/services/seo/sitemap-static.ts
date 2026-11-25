/**
 * 静态 sitemap（/sitemap/static.xml）
 *
 * @module lib/services/seo/sitemap-static
 *
 * @description 固定页面 + 国别入口 + 供应商详情。与公告分片分开：
 *              公告分片由快照任务重建（5 万/片），静态片每次请求实时拼装
 *              （22 个固定页 + ≤200 国别 + ≤2000 供应商，实测 ~0.2 s）。
 *
 *              只输出 loc + lastmod：changefreq/priority 已被 Google 忽略，
 *              写进协议只会增大体积。
 */
import type { SitemapEntry } from "./sitemap-xml";
import { SITE_URL } from "./site";
import { fetchSitemapCountries, fetchSitemapSuppliers } from "./sitemap-sources";

const BASE_URL = SITE_URL;

/** 固定入口（含法律与关于页）；/en 已下线，不再出现 */
const STATIC_PATHS = [
  "/",
  "/procurement",
  "/procurement/countries",
  "/procurement/industries",
  "/rfq",
  "/supplier",
  "/award-intelligence",
  "/training",
  "/learning",
  "/membership",
  "/services",
  "/ecosystem",
  "/terms",
  "/privacy",
  "/copyright",
  "/refund-policy",
  "/account-cancellation",
  "/about",
  "/contact",
  "/faq",
  "/notice-source",
  "/complaint",
] as const;

function isoOrNull(v: Date | string | number | null): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** 拼装 /sitemap/static.xml 的全部条目（DB 异常时降级为固定页） */
export async function buildStaticEntries(): Promise<SitemapEntry[]> {
  const pages: SitemapEntry[] = STATIC_PATHS.map((p) => ({ loc: `${BASE_URL}${p}` }));

  let countryPages: SitemapEntry[] = [];
  try {
    const countries = await fetchSitemapCountries();
    countryPages = countries.map((c) => ({
      loc: `${BASE_URL}/procurement?country=${encodeURIComponent(c.param)}`,
    }));
  } catch (err) {
    console.error("[sitemap-static] 国别段生成失败，已降级为空:", (err as Error).message);
  }

  let supplierPages: SitemapEntry[] = [];
  try {
    const rows = await fetchSitemapSuppliers();
    supplierPages = rows.map((row) => ({
      loc: `${BASE_URL}/supplier/${row.id}`,
      lastmod: isoOrNull(row.addtime),
    }));
  } catch (err) {
    console.error("[sitemap-static] 供应商段生成失败，已降级为空:", (err as Error).message);
  }

  return [...pages, ...countryPages, ...supplierPages];
}
