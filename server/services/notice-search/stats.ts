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
  noticeCountCache, NOTICE_COUNT_CACHE_TTL, NOTICE_COUNT_CACHE_TTL_KEYWORD,
  featuredCountCache, FEATURED_COUNT_CACHE_TTL,
  countCacheKey,
} from "./cache";

// 只用 deadline_sec 实时判断，不再依赖 is_active 缓存
const ACTIVE_NOTICE_WHERE = `(n.deadline_ts IS NULL OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))`;
const DEADLINE_FILTER = `(deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))`;

// 统计表键版本后缀：多实例共享库环境下，旧代码实例仍会按 is_active 口径写入无后缀 key
// （如 active_total ≈ 12.6 万），与 deadline 口径（≈ 6.8 万）轮流覆盖导致总数波动。
// 新代码统一读写带 _v2 后缀的键，旧实例的写入被自然隔离（无人读取），无需停服、无需强制全员同步升级。
const STATS_KEY_VER = "_v2";

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
    return `agency:${p.agency}${STATS_KEY_VER}`;
  }
  if (p.country) return `country:${p.country}${STATS_KEY_VER}`;
  if (p.featuredOnly) return `featured${STATS_KEY_VER}`;
  return `active_total${STATS_KEY_VER}`;
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

/** 刷新预计算统计表——在数据导入后调用 */
export async function refreshNoticeStats(pool: Pool): Promise<void> {
  try {
    // 修复：刷新前先清除内存缓存，避免旧值在统计表更新后仍被使用
    // 原问题：搜索请求在 refreshNoticeStats 之前到达时，旧值被 noticeCountCache
    // 缓存 10 分钟。即使统计表随后被刷新为正确值，缓存中的旧值仍被返回，
    // 导致 total 显示为过时数据（如 121,528 而非 68,390）。
    noticeCountCache.clear();
    const t0 = Date.now();
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM crm_bid_notices WHERE ${DEADLINE_FILTER}`
    );
    const activeTotal = Number((totalRows as any[])[0]?.cnt || 0);

    const [featuredRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM crm_bid_notices
       WHERE is_featured = 1 AND ${DEADLINE_FILTER}`
    );
    const featuredTotal = Number((featuredRows as any[])[0]?.cnt || 0);

    const [countryRows] = await pool.query(
      `SELECT country, COUNT(*) AS cnt FROM crm_bid_notices
       WHERE ${DEADLINE_FILTER} AND country IS NOT NULL AND country != ''
       GROUP BY country ORDER BY cnt DESC LIMIT 50`
    );

    const [agencyRows] = await pool.query(
      `SELECT agency, COUNT(*) AS cnt FROM crm_bid_notices
       WHERE ${DEADLINE_FILTER} AND agency IS NOT NULL AND agency != ''
       GROUP BY agency ORDER BY cnt DESC LIMIT 50`
    );

    const entries: [string, number][] = [
      [`active_total${STATS_KEY_VER}`, activeTotal],
      [`featured${STATS_KEY_VER}`, featuredTotal],
      ...(countryRows as any[]).map((r: any) => [`country:${r.country}${STATS_KEY_VER}` as string, Number(r.cnt)] as [string, number]),
      ...(agencyRows as any[]).map((r: any) => [`agency:${r.agency}${STATS_KEY_VER}` as string, Number(r.cnt)] as [string, number]),
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
