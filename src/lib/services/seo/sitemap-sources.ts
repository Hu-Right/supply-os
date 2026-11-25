/**
 * Sitemap 数据源 — 静态片/供应商
 *
 * @module lib/services/seo/sitemap-sources
 * @description 为 /sitemap/static.xml 提供国别入口与供应商 URL。
 *              公告分片改由 sitemap-snapshot 的预生成快照提供（2026-11-25），
 *              不再在这里做逐请求分页查询。
 *
 *              历史缺陷背景（2026-08-28 修复）：sitemap 曾查询不存在的
 *              notices/suppliers 表并被统一 try/catch 静默吞掉，
 *              数千动态 URL 长期未被搜索引擎收录。
 */
import type { Pool } from "mysql2/promise";
import { getPool } from "@/lib/db/pool";
import { listCountryLandings } from "./landing";
import { countryParamOfName } from "./country-slug";

export interface SitemapSupplierRow {
  id: number;
  addtime: Date | string | number | null;
}

/** 动态供应商 URL 上限 */
const SUPPLIER_LIMIT = 2000;

/**
 * 供应商详情页（/supplier/[id] 已上线）。
 * supplier 表为外部只读表，无 updated_at —— 以 addtime 作为 lastModified。
 * 只提交公开口径（info_review_status='reviewed'）且排除测试数据，避免 sitemap 指向 404。
 */
export async function fetchSitemapSuppliers(pool?: Pool): Promise<SitemapSupplierRow[]> {
  const db = pool ?? getPool();
  const [rows] = await db.query(
    `SELECT id, addtime
     FROM supplier
     WHERE info_review_status = 'reviewed'
       AND company <> '测试'
     ORDER BY id DESC
     LIMIT ${SUPPLIER_LIMIT}`,
  );
  return rows as SitemapSupplierRow[];
}

/** 国别页进 sitemap 的最低有效公告数（薄页不提交收录，只保留站内可达） */
const COUNTRY_SITEMAP_MIN = 20;
/** 国别 URL 上限（预留公告段的余量，总量控制在协议 5 万以内） */
const COUNTRY_SITEMAP_LIMIT = 200;

/**
 * 国别入口 URL（2026-11-25 · GEO B 路线）。
 *
 * 原实现在 sitemap 里提交 `/procurement/country/{slug}` 落地页；该层已判定为
 * 「与搜索页重复的第二套表达」，落地页改为 308 跳转到 `/procurement?country={取值}` 后下线。
 * 这里返回**国家码**（PS/CD 例外给标准名，见 country-slug.ts），与
 * `/procurement` 的 canonical 同源，保证 sitemap 里的 URL 与该页声明的 canonical 逐字一致。
 *
 * 门槛沿用 20 条：低于此数的国家页内容过薄，进 sitemap 只会拉低整站质量；
 * 它们仍可从「按国家浏览」汇总页点进去，只是不提交收录。
 */
export async function fetchSitemapCountries(pool?: Pool): Promise<Array<{ param: string }>> {
  const list = await listCountryLandings(pool);
  return list
    .filter((c) => c.count >= COUNTRY_SITEMAP_MIN)
    .slice(0, COUNTRY_SITEMAP_LIMIT)
    // countryParamOfName 解析不出国家的（脏别名）直接剔除，避免提交到无筛选意义的 URL
    .flatMap((c) => {
      const param = countryParamOfName(c.name);
      return param ? [{ param }] : [];
    });
}
