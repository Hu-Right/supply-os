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
 * 动态公告 URL 上限。
 *
 * sitemap 协议单文件硬上限 50000 条 URL，此处取 44000 给静态段留余量。
 * 2026-11-18 由 5000 提升：实测有效公告（ACTIVE_NOTICE_WHERE）≥ 5 万条，
 * 旧值让 90% 以上公告永远进不了索引。若有效公告继续增长到超过 4.4 万，
 * 下一步是拆分 sitemap 索引（/sitemap.xml 作 index + /sitemaps/[id].xml），
 * 不要继续上调本常量（越过 50000 会被搜索引擎整份丢弃）。
 */
const NOTICE_LIMIT = 44000;
/** 动态供应商 URL 上限 */
const SUPPLIER_LIMIT = 2000;

/**
 * 有效公告（与搜索侧同口径：未截止 + deadline_sec=0 视为长期有效）。
 * 按 create_time（入库时间）倒序取最新 NOTICE_LIMIT 条。
 *
 * [2026-11-18 口径修正] 原排序/ lastmod 用 update_time，但该列混入
 * `YYYYMMDDHHMMSS` 形态脏值（如 20261030012753，集中在 BOAMP 83 行）：
 * 倒序会把这批行永久顶到最前，且 `new Date(值*1000)` 越界 → lastmod 退化成 now。
 * create_time 实测为干净 Unix 秒（2026-05 ~ 现在，无 NULL/0），改为唯一时间口径。
 */
export async function fetchSitemapNotices(pool?: Pool): Promise<SitemapNoticeRow[]> {
  const db = pool ?? getPool();
  const [rows] = await db.query(
    `SELECT n.id, n.create_time
     FROM bid_notices n
     WHERE ${ACTIVE_NOTICE_WHERE}
     ORDER BY n.create_time DESC
     LIMIT ${NOTICE_LIMIT}`,
  );
  return rows as SitemapNoticeRow[];
}

/**
 * 供应商目录（排除测试数据）。
 * supplier 表为外部只读表，无 updated_at —— 以 addtime 作为 lastModified。
 */
export async function fetchSitemapSuppliers(pool?: Pool): Promise<SitemapSupplierRow[]> {
  const db = pool ?? getPool();
  const [rows] = await db.query(
    `SELECT id, addtime
     FROM supplier
     WHERE company <> '测试'
     ORDER BY id DESC
     LIMIT ${SUPPLIER_LIMIT}`,
  );
  return rows as SitemapSupplierRow[];
}

/** 国别落地页进 sitemap 的最低有效公告数（薄页只保留页面、不提交收录） */
const COUNTRY_SITEMAP_MIN = 20;
/** 国别落地页 URL 上限（预留公告段的余量，总量控制在协议 5 万以内） */
const COUNTRY_SITEMAP_LIMIT = 200;

/**
 * 国别聚合落地页（/procurement/country/[slug]）。
 * 复用 landing 的规范化清单：slug 与页面路由同源，避免 sitemap 提交到 404。
 */
export async function fetchSitemapCountries(pool?: Pool): Promise<Array<{ slug: string }>> {
  const list = await listCountryLandings(pool);
  return list
    .filter((c) => c.count >= COUNTRY_SITEMAP_MIN)
    .slice(0, COUNTRY_SITEMAP_LIMIT)
    .map((c) => ({ slug: c.slug }));
}
