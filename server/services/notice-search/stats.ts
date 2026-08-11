/**
 * 公采池统计 + is_active 预计算列刷新
 * Notice pool statistics & is_active column refresh
 *
 * @module server/services/notice-search/stats
 * @description 统计表（crm_notice_stats）的刷新与查询、is_active 预计算列的定期回填。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { NoticeSearchParams, NoticeStatsResult } from "./types";
import {
  noticeCountCache, NOTICE_COUNT_CACHE_TTL,
  featuredCountCache, FEATURED_COUNT_CACHE_TTL,
  countCacheKey,
} from "./cache";

const ACTIVE_NOTICE_WHERE = `n.is_active = 1 AND (n.deadline_ts IS NULL OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))`;
const DEADLINE_FILTER = `(deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))`;

// ── 统计缓存 ──
let noticeStatsCache: { data: NoticeStatsResult; expires: number } | null = null;

/** 根据搜索参数生成统计表 key；无法映射时返回 null（回退到 COUNT 查询） */
export function statsKeyFor(p: NoticeSearchParams): string | null {
  if (p.q) return null;
  if (p.codeId) return null;
  if (p.deadlineFrom || p.deadlineTo || p.deadlineWithinDays) return null;
  if (p.noticeType) return null;
  // 修复：移除 sort 检查——排序不影响总数，所有排序方式应使用同一 count 源
  // 原逻辑：sort !== "deadline_farthest" 时返回 null 走 COUNT 查询，导致不同排序显示不同 total
  if (p.country && p.agency) return null;
  if (p.featuredOnly && (p.country || p.agency)) return null;
  // P1 修复：聚合机构名（如 MUNICIPIO_BR、FORCE_COUNTRY_*、ORPHAN_*）在统计表中不存在
  // 直接返回 null 跳过无效查表，走 COUNT 查询/缓存路径
  if (p.agency) {
    const a = p.agency;
    if (a.includes("_BR") || a.includes("_KE") || a.startsWith("FORCE_COUNTRY_")
        || a.startsWith("ORPHAN_") || a === "ORPHAN_OTHER"
        || a.endsWith("_INTL") || a === "DEV_BANKS") {
      return null; // 聚合机构名，统计表无对应条目
    }
    return `agency:${p.agency}`;
  }
  if (p.country) return `country:${p.country}`;
  if (p.featuredOnly) return "featured";
  return "active_total";
}

/** 从统计表读取预计算总数；未命中返回 null */
export async function getStatsCount(pool: Pool, key: string): Promise<number | null> {
  try {
    const [rows] = await pool.query(
      "SELECT stat_value FROM crm_notice_stats WHERE stat_key = ?",
      [key]
    );
    const arr = rows as any[];
    return arr.length > 0 ? Number(arr[0].stat_value) : null;
  } catch {
    return null;
  }
}

/** 回填/刷新 is_active 列——将过期或已过截止日期的公告标记为 inactive，返回变更的 ID 列表 */
export async function refreshIsActive(pool: Pool): Promise<{ marked: number; unmarked: number; changedIds: number[]; wideSyncFailedIds: number[] }> {
  try {
    const t0 = Date.now();
    const [toDeactivate] = await pool.query(
      `SELECT id FROM crm_bid_notices
       WHERE is_active = 1
         AND (is_expired = 1 OR (deadline_ts IS NOT NULL AND deadline_sec < UNIX_TIMESTAMP(NOW())))`
    );
    const deactivateIds = (toDeactivate as any[]).map(r => r.id);

    const [deactivateResult] = await pool.query(
      `UPDATE crm_bid_notices SET is_active = 0
       WHERE is_active = 1
         AND (is_expired = 1 OR (deadline_ts IS NOT NULL AND deadline_sec < UNIX_TIMESTAMP(NOW())))`
    );
    const marked = (deactivateResult as any)?.affectedRows || 0;

    const [toReactivate] = await pool.query(
      `SELECT id FROM crm_bid_notices
       WHERE is_active = 0
         AND (is_expired = 0 OR is_expired IS NULL)
         AND (deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))`
    );
    const reactivateIds = (toReactivate as any[]).map(r => r.id);

    const [reactivateResult] = await pool.query(
      `UPDATE crm_bid_notices SET is_active = 1
       WHERE is_active = 0
         AND (is_expired = 0 OR is_expired IS NULL)
         AND (deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))`
    );
    const unmarked = (reactivateResult as any)?.affectedRows || 0;

    const changedIds = [...deactivateIds, ...reactivateIds];

    // 同步更新宽表的 is_active 字段
    // 修复：批量更新失败时逐行重试，收集仍然失败的 ID 供上层从主表直接补偿
    const wideSyncFailedIds: number[] = [];
    if (changedIds.length > 0) {
      try {
        // 批量更新宽表
        const batchSize = 1000;
        for (let i = 0; i < changedIds.length; i += batchSize) {
          const batch = changedIds.slice(i, i + batchSize);
          const placeholders = batch.map(() => '?').join(',');
          try {
            await pool.query(
              `UPDATE crm_notice_search ns
               INNER JOIN crm_bid_notices n ON n.id = ns.id
               SET ns.is_active = n.is_active
               WHERE ns.id IN (${placeholders})`,
              batch
            );
          } catch (batchErr) {
            // 批量失败，逐行重试以最大化成功数量
            console.warn(`[is-active] 宽表批量同步失败，逐行重试 (${batch.length} rows):`, (batchErr as Error).message);
            for (const id of batch) {
              try {
                await pool.query(
                  `UPDATE crm_notice_search ns
                   INNER JOIN crm_bid_notices n ON n.id = ns.id
                   SET ns.is_active = n.is_active
                   WHERE ns.id = ?`,
                  [id]
                );
              } catch {
                wideSyncFailedIds.push(id);
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[is-active] 宽表同步异常（已收集失败 ID）:`, (e as Error).message);
        wideSyncFailedIds.push(...changedIds);
      }
      if (wideSyncFailedIds.length > 0) {
        console.warn(`[is-active] 宽表同步失败 ${wideSyncFailedIds.length} 条，将由 timers 从主表直接补偿`);
      }
    }

    console.log(`[is-active] is_active 刷新完成: ${Date.now() - t0}ms (deactivated=${marked}, reactivated=${unmarked}, changedIds=${changedIds.length}, wideSyncFailed=${wideSyncFailedIds.length})`);
    return { marked, unmarked, changedIds, wideSyncFailedIds };
  } catch (e) {
    console.error("[is-active] is_active 刷新失败（静默降级）:", (e as Error).message);
    return { marked: 0, unmarked: 0, changedIds: [], wideSyncFailedIds: [] };
  }
}

/** 刷新预计算统计表——在数据导入后调用 */
export async function refreshNoticeStats(pool: Pool): Promise<void> {
  try {
    const t0 = Date.now();
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM crm_bid_notices WHERE is_active = 1 AND ${DEADLINE_FILTER}`
    );
    const activeTotal = Number((totalRows as any[])[0]?.cnt || 0);

    const [featuredRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM crm_bid_notices
       WHERE is_featured = 1 AND is_active = 1 AND ${DEADLINE_FILTER}`
    );
    const featuredTotal = Number((featuredRows as any[])[0]?.cnt || 0);

    const [countryRows] = await pool.query(
      `SELECT country, COUNT(*) AS cnt FROM crm_bid_notices
       WHERE is_active = 1 AND ${DEADLINE_FILTER} AND country IS NOT NULL AND country != ''
       GROUP BY country ORDER BY cnt DESC LIMIT 50`
    );

    const [agencyRows] = await pool.query(
      `SELECT agency, COUNT(*) AS cnt FROM crm_bid_notices
       WHERE is_active = 1 AND ${DEADLINE_FILTER} AND agency IS NOT NULL AND agency != ''
       GROUP BY agency ORDER BY cnt DESC LIMIT 50`
    );

    const entries: [string, number][] = [
      ["active_total", activeTotal],
      ["featured", featuredTotal],
      ...(countryRows as any[]).map((r: any) => [`country:${r.country}` as string, Number(r.cnt)] as [string, number]),
      ...(agencyRows as any[]).map((r: any) => [`agency:${r.agency}` as string, Number(r.cnt)] as [string, number]),
    ];

    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO crm_notice_stats (stat_key, stat_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE stat_value = VALUES(stat_value)`,
        [key, value]
      );
    }

    // P3-5 修复：预填充复用 countCacheKey 生成逻辑
    const defaultParams: NoticeSearchParams = {
      page: 1, pageSize: 9, q: "", country: "", agency: "",
      deadlineFrom: "", deadlineTo: "", sort: "deadline_farthest",
      deadlineWithinDays: 0, noticeType: "", featuredOnly: false,
    };
    noticeCountCache.set(
      countCacheKey({ ...defaultParams }),
      { total: activeTotal, expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
    );
    featuredCountCache.total = featuredTotal;
    featuredCountCache.expires = Date.now() + FEATURED_COUNT_CACHE_TTL;
    noticeCountCache.set(
      countCacheKey({ ...defaultParams, featuredOnly: true }),
      { total: featuredTotal, expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
    );
    for (const row of countryRows as any[]) {
      noticeCountCache.set(
        countCacheKey({ ...defaultParams, country: row.country }),
        { total: Number(row.cnt), expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
      );
    }
    for (const row of agencyRows as any[]) {
      noticeCountCache.set(
        countCacheKey({ ...defaultParams, agency: row.agency }),
        { total: Number(row.cnt), expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
      );
    }

    console.log(`[notice-stats] 统计表刷新完成: ${entries.length} 条, ${Date.now() - t0}ms (active=${activeTotal}, featured=${featuredTotal}, 内存缓存已预填充)`);
  } catch (e) {
    console.error("[notice-stats] 统计表刷新失败（静默降级）:", (e as Error).message);
  }
}

/** 获取公采池统计数据 */
export async function getNoticeStats(pool: Pool): Promise<NoticeStatsResult> {
  if (noticeStatsCache && noticeStatsCache.expires > Date.now()) return noticeStatsCache.data;
  const [rawRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_bid_notices n");
  const [activeRows] = await pool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE}`);
  const [bridgedRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE}
     AND EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.notice_id)`
  );
  const [featuredRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE} AND n.is_featured = 1`
  );
  const active = Number((activeRows as RowDataPacket[])[0]?.total || 0);
  const bridged = Number((bridgedRows as RowDataPacket[])[0]?.total || 0);
  const data: NoticeStatsResult = {
    raw: Number((rawRows as RowDataPacket[])[0]?.total || 0), active, bridged,
    featured: Number((featuredRows as RowDataPacket[])[0]?.total || 0), bridge_gap: active - bridged,
  };
  noticeStatsCache = { data, expires: Date.now() + 10 * 60 * 1000 };
  return data;
}

/** 清除统计缓存（测试辅助） */
export function clearStatsCache(): void {
  noticeStatsCache = null;
}
