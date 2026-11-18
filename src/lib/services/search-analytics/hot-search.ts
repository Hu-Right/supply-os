/**
 * 真实热门搜索 — 取数编排（DB + 进程内缓存）
 *
 * @module server/services/search-analytics/hot-search
 * @description 首页「热门搜索」的数据出口：从 user_search_log 按窗口聚合真实检索行为，
 *              口径全部委托 hot-search-core（纯逻辑、可单测），本文件只做：
 *               1) 读日志表（按「词 × 访客」分组，匿名用 visitor_hash、登录用 u:<id>）；
 *               2) 喂给 computeHotTerms 得到榜单 + 用 decideHotMode 判整体模式；
 *               3) 10 分钟进程内缓存（与 hot-topics 同款）；
 *               4) 90 天（可配）保留期清理，供 lifecycle 定时任务调用。
 *
 *              冷启动口径：数据不足时 mode="fallback"，接口返回空关键词列表，
 *              首页自动回退到现有「数据覆盖榜」（热门国家/热门品目），不显示单人测试词。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { CACHE_TTL_MEDIUM_MS } from "@/shared/constants/time";
import {
  computeHotTerms,
  decideHotMode,
  HOT_SEARCH_DEFAULTS,
  type HotSearchMode,
  type HotSearchTerm,
  type HotSearchVisitorRow,
} from "./hot-search-core";

export interface HotSearchesResult {
  mode: HotSearchMode;
  terms: HotSearchTerm[];
  windowDays: number;
  /** 本次聚合生成时间（ISO） */
  updatedAt: string;
}

export interface GetHotSearchesOptions {
  windowDays?: number;
  limit?: number;
}

/** 聚合配置（全部可用 env 覆盖；默认值面向冷启动期，数据量起来后可上调门槛） */
export interface HotSearchConfig {
  /** 统计窗口（天） */
  windowDays: number;
  limit: number;
  perVisitorCap: number;
  minVisitors: number;
  minSearches: number;
  minHitRate: number;
  /** 整体展示门槛：窗口有效搜索总量 / 合格词数，低于则 fallback */
  minTotalSearches: number;
  minQualifiedTerms: number;
}

const cache = new Map<string, { data: HotSearchesResult; expires: number }>();
/** 分组行上限：防异常增长把一次聚合拖死（当前全表 1.4k 行，离上限很远） */
const MAX_GROUPED_ROWS = 20_000;

/** 日志/统计的排除用户（测试与内部账号；逗号分隔 env，解析失败忽略） */
export function excludedSearchUserIds(): number[] {
  return String(process.env.SEARCH_LOG_EXCLUDE_USER_IDS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function clampFloat(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** 读取热榜配置（每次调用读 env；env 值非法时回退默认并夹逼到安全区间） */
export function hotSearchConfig(): HotSearchConfig {
  return {
    windowDays: clampInt(process.env.HOT_SEARCH_WINDOW_DAYS, 1, 365, 90),
    limit: clampInt(process.env.HOT_SEARCH_LIMIT, 1, 12, HOT_SEARCH_DEFAULTS.limit),
    perVisitorCap: clampInt(process.env.HOT_SEARCH_PER_VISITOR_CAP, 1, 20, HOT_SEARCH_DEFAULTS.perVisitorCap),
    minVisitors: clampInt(process.env.HOT_SEARCH_MIN_VISITORS, 1, 50, HOT_SEARCH_DEFAULTS.minVisitors),
    minSearches: clampInt(process.env.HOT_SEARCH_MIN_SEARCHES, 1, 200, HOT_SEARCH_DEFAULTS.minSearches),
    minHitRate: clampFloat(process.env.HOT_SEARCH_MIN_HIT_RATE, 0, 1, HOT_SEARCH_DEFAULTS.minHitRate),
    minTotalSearches: clampInt(process.env.HOT_SEARCH_MIN_TOTAL_SEARCHES, 0, 1_000_000, HOT_SEARCH_DEFAULTS.minTotalSearches),
    minQualifiedTerms: clampInt(process.env.HOT_SEARCH_MIN_QUALIFIED_TERMS, 1, 12, HOT_SEARCH_DEFAULTS.minQualifiedTerms),
  };
}

/**
 * 读取热门检索词。
 * @param opts.windowDays 统计窗口（天，1..365，缺省取 HOT_SEARCH_WINDOW_DAYS/90）
 * @param opts.limit 返回条数（1..12，缺省取 HOT_SEARCH_LIMIT/8）
 */
export async function getHotSearches(
  pool: Pool,
  opts: GetHotSearchesOptions = {},
): Promise<HotSearchesResult> {
  const cfg = hotSearchConfig();
  const windowDays = clampInt(opts.windowDays, 1, 365, cfg.windowDays);
  const limit = clampInt(opts.limit, 1, 12, cfg.limit);
  const cacheKey = JSON.stringify({ ...cfg, windowDays, limit });
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.data;

  const excludeIds = excludedSearchUserIds();
  const exclusionSql = excludeIds.length > 0
    ? `AND (user_id IS NULL OR user_id NOT IN (${excludeIds.map(() => "?").join(",")}))`
    : "";

  // 按「词 × 访客」分组：匿名=visitor_hash，登录=u:<user_id>；旧数据无 visitor_hash 的登录行仍可参与
  const visitorExpr = "COALESCE(NULLIF(visitor_hash, ''), CONCAT('u:', user_id))";
  const sql = `
    SELECT q_norm AS term, MAX(q) AS label, ${visitorExpr} AS visitor_key,
           COUNT(*) AS searches, SUM(result_cnt > 0) AS hits
      FROM user_search_log
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${windowDays} DAY)
       AND q_norm IS NOT NULL AND q_norm <> ''
       AND is_bot = 0
       AND ${visitorExpr} IS NOT NULL
       ${exclusionSql}
     GROUP BY q_norm, visitor_key
     LIMIT ${MAX_GROUPED_ROWS}`;
  const [rows] = await pool.query<RowDataPacket[]>(sql, excludeIds);

  const grouped: HotSearchVisitorRow[] = rows.map((r) => ({
    term: String(r.term ?? ""),
    label: r.label === null || r.label === undefined ? null : String(r.label),
    visitorKey: String(r.visitor_key ?? ""),
    searches: Number(r.searches) || 0,
    hits: Number(r.hits) || 0,
  }));

  // 窗口内有效搜索总量（决定是否值得展示真实热榜）
  const [totalRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM user_search_log
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${windowDays} DAY)
        AND q_norm IS NOT NULL AND q_norm <> ''
        AND is_bot = 0 ${exclusionSql}`,
    excludeIds,
  );
  const totalSearches = Number(totalRows[0]?.n ?? 0);

  const terms = computeHotTerms(grouped, {
    limit,
    perVisitorCap: cfg.perVisitorCap,
    minVisitors: cfg.minVisitors,
    minSearches: cfg.minSearches,
    minHitRate: cfg.minHitRate,
  });
  const mode = decideHotMode(
    { totalSearches, qualifiedTerms: terms.length },
    { minTotalSearches: cfg.minTotalSearches, minQualifiedTerms: cfg.minQualifiedTerms },
  );
  const data: HotSearchesResult = {
    mode,
    // fallback 时不对外暴露任何词（数据量不足以代表"大家"）
    terms: mode === "hot" ? terms : [],
    windowDays,
    updatedAt: new Date().toISOString(),
  };
  cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MEDIUM_MS });
  return data;
}

/** 首页热词标签点击后的落地链接（统一搜索页，词只作为 q）；API 与 ISR 快照共用 */
export function hotSearchHref(term: string): string {
  return `/procurement?q=${encodeURIComponent(term)}`;
}

/** 清缓存（测试辅助/运维手动失效） */
export function clearHotSearchesCache(): void {
  cache.clear();
}

/**
 * 保留期清理：删除 N 天前的检索日志（默认 90 天，env SEARCH_LOG_RETENTION_DAYS 可配）。
 * 分批删除，避免一次大 DELETE 长时间持锁。由 lifecycle 的 data-cleanup 定时任务调用。
 */
export async function cleanupOldSearchLogs(
  pool: Pool,
  opts: { days?: number; batchSize?: number } = {},
): Promise<number> {
  const days = clampInt(opts.days ?? process.env.SEARCH_LOG_RETENTION_DAYS, 7, 730, 90);
  const batchSize = clampInt(opts.batchSize, 100, 10_000, 2_000);
  let deleted = 0;
  for (let round = 0; round < 50; round++) {
    const [res] = await pool.query(
      `DELETE FROM user_search_log WHERE created_at < DATE_SUB(NOW(), INTERVAL ${days} DAY) LIMIT ${batchSize}`,
    );
    const affected = Number((res as { affectedRows?: number }).affectedRows ?? 0);
    deleted += affected;
    if (affected < batchSize) break;
  }
  return deleted;
}
