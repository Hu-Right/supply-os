/**
 * 公采搜索/国家/统计服务
 * Notice search, countries & stats service
 *
 * @module server/services/noticeSearch
 * @description 公告搜索的 SQL WHERE/ORDER 组装与执行、国家下拉与公采池统计；
 *              结果带 TTL 内存缓存。路由层仅做参数解析与搜索日志。
 *              SQL assembly & execution for notice search, country list and
 *              pool stats, with TTL-bounded in-memory caches.
 */
import type { Pool } from "mysql2/promise";
import { normalizeDocumentRows } from "../utils/normalize";
import { buildNoticeUnspscFilter } from "./unspsc";
import { FEATURED_NOTICE_EXISTS } from "./notices";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEADLINE_SEC_EXPR = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
const ACTIVE_NOTICE_WHERE = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${DEADLINE_SEC_EXPR} >= UNIX_TIMESTAMP(NOW()))`;

export interface NoticeSearchParams {
  page: number;
  pageSize: number;
  codeId?: number;
  q?: string;
  country?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  sort?: string;
  valueMin?: number;
  valueMax?: number;
  deadlineWithinDays?: number;
  noticeType?: string;
  featuredOnly?: boolean;
}

export interface NoticeSearchResult {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
}

// ── F.4 搜索性能预案第一档（本地差异 #7）──
const noticeSearchCache = new Map<string, { payload: NoticeSearchResult; expires: number }>();
const NOTICE_SEARCH_CACHE_TTL = 60 * 1000;
const NOTICE_SEARCH_CACHE_MAX = 200;

function searchCacheKey(p: NoticeSearchParams): string {
  return JSON.stringify([
    p.page, p.pageSize, p.codeId || 0, p.q || "", p.country || "", p.deadlineFrom || "",
    p.deadlineTo || "", p.sort || "deadline", p.valueMin || 0, p.valueMax || 0,
    p.deadlineWithinDays || 0, p.noticeType || "", !!p.featuredOnly,
  ]);
}

export async function searchNotices(pool: Pool, p: NoticeSearchParams): Promise<NoticeSearchResult> {
  const { page, pageSize } = p;
  const offset = (page - 1) * pageSize;
  const q = p.q || "";
  const country = p.country || "";
  const deadlineFrom = p.deadlineFrom || "";
  const deadlineTo = p.deadlineTo || "";
  const sort = p.sort || "deadline";
  const valueMin = p.valueMin || 0;
  const valueMax = p.valueMax || 0;
  const deadlineWithinDays = p.deadlineWithinDays || 0;
  const noticeType = p.noticeType || "";
  const featuredOnly = !!p.featuredOnly;

  const cacheKey = searchCacheKey(p);
  const cached = noticeSearchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.payload;

  const where: string[] = ["(n.is_expired = 0 OR n.is_expired IS NULL)"];
  const params: any[] = [];
  let join = "";
  let idFilterSql = "";
  const idFilterParams: any[] = [];

  where.push(`(n.deadline_ts IS NULL OR ${DEADLINE_SEC_EXPR} >= UNIX_TIMESTAMP(NOW()))`);

  if (p.codeId) {
    const filter = await buildNoticeUnspscFilter(pool, p.codeId);
    idFilterSql = filter.sql;
    idFilterParams.push(...filter.params);
  }

  const compactQ = q.replace(/\s+/g, "").toUpperCase();
  if (q) {
    join += " LEFT JOIN crm_notice_translations qzh ON qzh.notice_id = n.id AND qzh.lang = 'zh'";
    join += " LEFT JOIN crm_notice_translations qen ON qen.notice_id = n.id AND qen.lang = 'en'";
    const likeQ = `%${q}%`;
    where.push(
      "(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ? OR n.title LIKE ? OR n.reference LIKE ? OR n.description LIKE ? OR qzh.title_tr LIKE ? OR qzh.description_tr LIKE ? OR qen.title_tr LIKE ? OR qen.description_tr LIKE ?)"
    );
    params.push(compactQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
  }
  if (country) {
    // 精确匹配：国家值来自下拉（GROUP BY n.country 的精确值），LIKE 会误命中
    // 包含关系的国家（Guinea→Equatorial Guinea/Guinea-Bissau、Sudan→South Sudan 等）
    where.push("n.country = ?");
    params.push(country);
  }
  if (DATE_RE.test(deadlineFrom)) {
    where.push(`${DEADLINE_SEC_EXPR} >= UNIX_TIMESTAMP(?)`);
    params.push(`${deadlineFrom} 00:00:00`);
  }
  if (DATE_RE.test(deadlineTo)) {
    where.push(`${DEADLINE_SEC_EXPR} <= UNIX_TIMESTAMP(?)`);
    params.push(`${deadlineTo} 23:59:59`);
  }
  if (deadlineWithinDays > 0) {
    where.push(`n.deadline_ts IS NOT NULL AND ${DEADLINE_SEC_EXPR} <= UNIX_TIMESTAMP(NOW()) + ? * 86400`);
    params.push(deadlineWithinDays);
  }
  if (noticeType) {
    where.push("n.notice_type LIKE ?");
    params.push(`%${noticeType}%`);
  }
  if (valueMin || valueMax) {
    join += " INNER JOIN crm_notice_amount_cache vamc ON vamc.notice_id = n.id AND vamc.amount_usd IS NOT NULL";
    if (valueMin) { where.push("vamc.amount_usd >= ?"); params.push(valueMin); }
    if (valueMax) { where.push("vamc.amount_usd <= ?"); params.push(valueMax); }
  }
  // 精选过滤：只保留能三路关联到合格机会（crm_bid_opportunities）的公告；
  // 可投标期限由上方既有 is_expired/deadline_ts 条件保障，与其他筛选条件 AND 叠加
  if (featuredOnly) {
    where.push(FEATURED_NOTICE_EXISTS);
  }

  const orderParts: string[] = [];
  const orderParams: any[] = [];
  if (q) {
    orderParts.push("(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ?) DESC");
    orderParams.push(compactQ);
  }
  if (sort === "latest") {
    orderParts.push("n.id DESC");
  } else {
    orderParts.push("(n.deadline_ts IS NULL)", DEADLINE_SEC_EXPR, "n.id DESC");
  }
  const orderSql = orderParts.join(", ");
  const whereSql = where.join(" AND ");

  const [countRows] = await pool.query(
    `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n ${idFilterSql}${join} WHERE ${whereSql}`,
    [...idFilterParams, ...params]
  );
  const total = Number((countRows as any[])[0]?.total || 0);
  const [rows] = await pool.query(
    `SELECT DISTINCT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
       n.deadline, n.deadline_ts, n.estimated_value, n.description
     FROM crm_bid_notices n ${idFilterSql}${join} WHERE ${whereSql}
     ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    [...idFilterParams, ...params, ...orderParams, pageSize, offset]
  );

  const pageIds = (rows as any[]).map((row) => Number(row.id)).filter(Boolean);
  const breakdownCounts = new Map<number, number>();
  // 页级 is_featured 标注：featuredOnly 时全部命中，否则仅对当页 ≤30 条回查三路判定
  const featuredIds = new Set<number>();
  if (pageIds.length > 0 && featuredOnly) {
    for (const id of pageIds) featuredIds.add(id);
  } else if (pageIds.length > 0) {
    try {
      const [featRows] = await pool.query(
        `SELECT n.id FROM crm_bid_notices n WHERE n.id IN (${pageIds.map(() => "?").join(",")}) AND ${FEATURED_NOTICE_EXISTS}`,
        pageIds
      );
      for (const featRow of featRows as any[]) featuredIds.add(Number(featRow.id));
    } catch { /* 标注查询失败：静默降级，不影响列表主体 */ }
  }
  if (pageIds.length > 0) {
    try {
      const [docRows] = await pool.query(
        `SELECT id, documents, procurement_files FROM crm_bid_notices WHERE id IN (${pageIds.map(() => "?").join(",")})`,
        pageIds
      );
      for (const docRow of docRows as any[]) {
        breakdownCounts.set(Number(docRow.id), normalizeDocumentRows(docRow.documents, docRow.procurement_files).length);
      }
    } catch { /* 计数查询失败：静默降级 */ }
  }

  const payload: NoticeSearchResult = {
    items: (rows as any[]).map((row) => ({
      ...row, agency: null, organization: null, source_url: null, unspsc_codes: [], core_locked: true,
      is_featured: featuredIds.has(Number(row.id)),
      breakdown_file_count: breakdownCounts.has(Number(row.id)) ? breakdownCounts.get(Number(row.id)) : undefined,
    })),
    total, page, pageSize,
  };

  if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) {
    const now = Date.now();
    for (const [key, entry] of noticeSearchCache) { if (entry.expires <= now) noticeSearchCache.delete(key); }
    if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) noticeSearchCache.clear();
  }
  noticeSearchCache.set(cacheKey, { payload, expires: Date.now() + NOTICE_SEARCH_CACHE_TTL });

  return payload;
}

// ── G.3 国家下拉数据源（增强版：移除 LIMIT 100，返回全量国家供前端搜索过滤）──
let noticeCountriesCache: { data: any[]; expires: number } | null = null;

export async function getNoticeCountries(pool: Pool): Promise<any[]> {
  if (noticeCountriesCache && noticeCountriesCache.expires > Date.now()) return noticeCountriesCache.data;
  const [rows] = await pool.query(
    `SELECT n.country, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE (n.is_expired = 0 OR n.is_expired IS NULL) AND n.country IS NOT NULL AND n.country <> ''
     GROUP BY n.country ORDER BY cnt DESC`
  );
  const data = (rows as any[]).map((row) => ({ country: row.country, count: Number(row.cnt) }));
  noticeCountriesCache = { data, expires: Date.now() + 10 * 60 * 1000 };
  return data;
}

// ── 公采池统计 ──
let noticeStatsCache: { data: any; expires: number } | null = null;

export async function getNoticeStats(pool: Pool): Promise<any> {
  if (noticeStatsCache && noticeStatsCache.expires > Date.now()) return noticeStatsCache.data;
  const [rawRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_bid_notices n");
  const [activeRows] = await pool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE}`);
  const [bridgedRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE}
     AND EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.notice_id)`
  );
  // [精选功能重新启用 2026-07-31] 恢复真实精选计数（结果随 stats 缓存 10 分钟）
  const [featuredRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE} AND ${FEATURED_NOTICE_EXISTS}`
  );
  const active = Number((activeRows as any[])[0]?.total || 0);
  const bridged = Number((bridgedRows as any[])[0]?.total || 0);
  const data = {
    raw: Number((rawRows as any[])[0]?.total || 0), active, bridged,
    featured: Number((featuredRows as any[])[0]?.total || 0), bridge_gap: active - bridged,
  };
  noticeStatsCache = { data, expires: Date.now() + 10 * 60 * 1000 };
  return data;
}
