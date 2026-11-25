/**
 * Sitemap 数据源 — 单一事实源
 * Sitemap data sources (single source of truth)
 *
 * @module lib/services/seo/sitemap-sources
 * @description 为 app/sitemap.ts 提供类型化的动态 URL 数据。
 *              表名/列名以真实 schema 为准（bid_notices / supplier），
 *              「有效公告」判定复用 utils/notice-expired 的 ACTIVE_NOTICE_WHERE
 *              权威过滤器 —— 搜索侧与 sitemap 侧永不脱节。
 *              历史缺陷背景（2026-08-28 修复）：sitemap 曾查询不存在的
 *              notices/suppliers 表并被统一 try/catch 静默吞掉，
 *              数千动态 URL 长期未被搜索引擎收录。
 */
import type { Pool } from "mysql2/promise";
import { getPool } from "@/lib/db/pool";
import { ACTIVE_NOTICE_WHERE } from "@/lib/utils/notice-expired";
import { listCountryLandings } from "./landing";
import { countryParamOfName } from "./country-slug";

export interface SitemapNoticeRow {
  id: number;
  /** 入库时间（Unix 秒）。2026-11-18 起替代 update_time 作为 sitemap lastmod 来源 */
  create_time: Date | string | number;
}

export interface SitemapSupplierRow {
  id: number;
  addtime: Date | string | number | null;
}

/**
 * 公告 sitemap 分片大小。
 *
 * 协议单文件硬上限 50000 条 URL；按 50000 一片拆成多个 sitemap，
 * 由 app/sitemap.ts 的 generateSitemaps 生成 /sitemap/{id}.xml。
 * 当前有效公告 37 万+，固定 8 片（0~7）覆盖 40 万；超过再增加分片。
 */
export const SITEMAP_NOTICE_PAGE_SIZE = 50000;
/** 公告分片数量（0~7 为公告，第 8 片为静态/国别/供应商） */
export const SITEMAP_NOTICE_SHARDS = 8;
/** 静态/国别/供应商所在分片 id */
export const SITEMAP_STATIC_SHARD = SITEMAP_NOTICE_SHARDS;
/** 动态供应商 URL 上限 */
const SUPPLIER_LIMIT = 2000;

/**
 * 按 offset 取一片有效公告（与搜索侧同口径：未截止 + deadline_sec=0 视为长期有效）。
 * 按 create_time（入库时间）倒序，保证分片稳定、不重不漏。
 */
export async function fetchSitemapNoticesPage(
  offset: number,
  limit: number,
  pool?: Pool,
): Promise<SitemapNoticeRow[]> {
  const db = pool ?? getPool();
  const [rows] = await db.query(
    `SELECT n.id, n.create_time
     FROM bid_notices n
     WHERE ${ACTIVE_NOTICE_WHERE}
     ORDER BY n.create_time DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows as SitemapNoticeRow[];
}

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
