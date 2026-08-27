/**
 * Sitemap 数据源 — 单一事实源
 * Sitemap data sources (single source of truth)
 *
 * @module lib/services/seo/sitemap-sources
 * @description 为 app/sitemap.ts 提供类型化的动态 URL 数据。
 *              表名/列名以真实 schema 为准（crm_bid_notices / supplier），
 *              「有效公告」判定复用 utils/notice-expired 的 ACTIVE_NOTICE_WHERE
 *              权威过滤器 —— 搜索侧与 sitemap 侧永不脱节。
 *              历史缺陷背景（2026-08-28 修复）：sitemap 曾查询不存在的
 *              notices/suppliers 表并被统一 try/catch 静默吞掉，
 *              数千动态 URL 长期未被搜索引擎收录。
 */
import type { Pool } from "mysql2/promise";
import { getPool } from "@/lib/db/pool";
import { ACTIVE_NOTICE_WHERE } from "@/lib/utils/notice-expired";

export interface SitemapNoticeRow {
  id: number;
  update_time: Date | string | number;
}

export interface SitemapSupplierRow {
  id: number;
  addtime: Date | string | number | null;
}

/** 动态公告 URL 上限（与搜索侧索引规模匹配） */
const NOTICE_LIMIT = 5000;
/** 动态供应商 URL 上限 */
const SUPPLIER_LIMIT = 2000;

/**
 * 有效公告（与搜索侧同口径：未截止 + deadline_sec=0 视为长期有效）。
 * 按 update_time 倒序取最新 NOTICE_LIMIT 条。
 */
export async function fetchSitemapNotices(pool?: Pool): Promise<SitemapNoticeRow[]> {
  const db = pool ?? getPool();
  const [rows] = await db.query(
    `SELECT n.id, n.update_time
     FROM crm_bid_notices n
     WHERE ${ACTIVE_NOTICE_WHERE}
     ORDER BY n.update_time DESC
     LIMIT ${NOTICE_LIMIT}`,
  );
  return rows as SitemapNoticeRow[];
}

/**
 * 供应商目录（排除测试数据与已合并记录）。
 * supplier 表为外部只读表，无 updated_at —— 以 addtime 作为 lastModified。
 */
export async function fetchSitemapSuppliers(pool?: Pool): Promise<SitemapSupplierRow[]> {
  const db = pool ?? getPool();
  const [rows] = await db.query(
    `SELECT id, addtime
     FROM supplier
     WHERE merged_id IS NULL AND company <> '测试'
     ORDER BY id DESC
     LIMIT ${SUPPLIER_LIMIT}`,
  );
  return rows as SitemapSupplierRow[];
}
