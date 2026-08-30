/**
 * 最新公告 SEO 数据源
 * Latest notices SEO data source
 *
 * @module lib/services/seo/latest-notices
 * @description 为 /procurement 首屏 SSR 内链区块提供最新有效公告。
 *              直查主表（确定性数据源），不走 searchUnified 编排 ——
 *              SEO 首屏内容不应耦合 Meilisearch 健康状态。
 *              复用 ACTIVE_NOTICE_WHERE 权威过滤器，与 sitemap/搜索同口径。
 */
import type { Pool } from "mysql2/promise";
import { getPool } from "@/lib/db/pool";
import { ACTIVE_NOTICE_WHERE } from "@/lib/utils/notice-expired";

export interface LatestNoticeRow {
  id: number;
  title: string;
  agency: string | null;
  country: string | null;
  notice_type: string | null;
  deadline_sec: number | null;
}

/** 最新有效公告（默认 10 条，按 update_time 倒序与 sitemap 口径一致） */
export async function fetchLatestActiveNotices(pool?: Pool, limit = 10): Promise<LatestNoticeRow[]> {
  const db = pool ?? getPool();
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const [rows] = await db.query(
    `SELECT n.id, n.title, n.agency, n.country, n.notice_type, n.deadline_sec
     FROM crm_bid_notices n
     WHERE ${ACTIVE_NOTICE_WHERE}
     ORDER BY n.update_time DESC
     LIMIT ${safeLimit}`,
  );
  return rows as LatestNoticeRow[];
}
