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
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../utils/normalize";
import { buildNoticeUnspscFilter } from "./unspsc";
import { FEATURED_NOTICE_EXISTS } from "./notices";
import type { NoticesRepo } from "../repos/notices.repo";
import { getTranslatedNoticeDetail } from "./notice-translation";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 性能优化：使用生成列 deadline_sec 替代表达式（阶段 3）
const DEADLINE_SEC_EXPR = "n.deadline_sec";
const ACTIVE_NOTICE_WHERE = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))`;

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
  /** 当前用户 locale（用于 LEFT JOIN 翻译表返回 title_i18n/description_i18n） */
  locale?: string;
}

export interface NoticeSearchResult {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
}

// ── F.4 搜索性能预案第一档（本地差异 #7）──
const noticeSearchCache = new Map<string, { payload: NoticeSearchResult; expires: number }>();
const NOTICE_SEARCH_CACHE_TTL = 180 * 1000;
const NOTICE_SEARCH_CACHE_MAX = 200;

function searchCacheKey(p: NoticeSearchParams): string {
  return JSON.stringify([
    p.page, p.pageSize, p.codeId || 0, p.q || "", p.country || "", p.deadlineFrom || "",
    p.deadlineTo || "", p.sort || "deadline", p.valueMin || 0, p.valueMax || 0,
    p.deadlineWithinDays || 0, p.noticeType || "", !!p.featuredOnly, p.locale || "",
  ]);
}

export async function searchNotices(
  pool: Pool,
  p: NoticeSearchParams,
  noticesRepo?: NoticesRepo,
): Promise<NoticeSearchResult> {
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
  const locale = p.locale || "";

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

  // 卡片国际化：LEFT JOIN 翻译表，按当前 locale 返回 title_i18n / description_i18n；
  // 使用独立别名 tr 避免与搜索关键词匹配用的 qzh/qen 冲突
  if (locale) {
    join += " LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?";
    params.push(locale);
  }
  // 英文回退 JOIN：当前语言无译文时回退到英文缓存
  join += " LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  // 精选公告中文描述：双路径 LEFT JOIN 机会表获取 description_cn（与 FEATURED_NOTICE_EXISTS 口径对齐）
  join += " LEFT JOIN crm_bid_opportunities opp_desc ON opp_desc.id = n.converted_opp_id AND (opp_desc.is_qualified = 1 OR opp_desc.status = 'won' OR opp_desc.audit_status = 1)";
  join += " LEFT JOIN crm_bid_opportunities opp_desc2 ON opp_desc2.source_notice_id = n.notice_id AND (opp_desc2.is_qualified = 1 OR opp_desc2.status = 'won' OR opp_desc2.audit_status = 1) AND opp_desc2.source_notice_id IS NOT NULL AND opp_desc2.source_notice_id <> ''";

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

  // 性能优化：并行执行 COUNT 和 SELECT 查询（阶段 1）
  const [countResult, rowsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n ${idFilterSql}${join} WHERE ${whereSql}`,
      [...idFilterParams, ...params]
    ),
    pool.query(
      `SELECT DISTINCT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
         n.deadline, n.deadline_ts, n.deadline_sec, n.estimated_value, n.description,
         tr.title_tr AS title_i18n, tr.description_tr AS description_i18n,
         tre.title_tr AS title_en, tre.description_tr AS description_en,
         COALESCE(opp_desc.description_cn, opp_desc2.description_cn) AS description_cn
       FROM crm_bid_notices n ${idFilterSql}${join} WHERE ${whereSql}
       ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      [...idFilterParams, ...params, ...orderParams, pageSize, offset]
    ),
  ]);
  
  const [countRows] = countResult;
  const [rows] = rowsResult;
  const total = Number((countRows as RowDataPacket[])[0]?.total || 0);

  const pageIds = (rows as RowDataPacket[]).map((row) => Number(row.id)).filter(Boolean);
  const breakdownCounts = new Map<number, number>();
  // 页级 is_featured 标注：featuredOnly 时全部命中，否则仅对当页 ≤30 条回查三路判定
  const featuredIds = new Set<number>();
  
  if (pageIds.length > 0) {
    if (featuredOnly) {
      for (const id of pageIds) featuredIds.add(id);
    } else {
      // 性能优化：并行执行精选标注和文件计数查询（阶段 1）
      try {
        const [featResult, docResult] = await Promise.all([
          pool.query(
            `SELECT n.id FROM crm_bid_notices n WHERE n.id IN (${pageIds.map(() => "?").join(",")}) AND ${FEATURED_NOTICE_EXISTS}`,
            pageIds
          ),
          pool.query(
            `SELECT id, documents, procurement_files FROM crm_bid_notices WHERE id IN (${pageIds.map(() => "?").join(",")})`,
            pageIds
          ),
        ]);
        
        const [featRows] = featResult;
        const [docRows] = docResult;
        
        for (const featRow of featRows as RowDataPacket[]) featuredIds.add(Number(featRow.id));
        
        for (const docRow of docRows as RowDataPacket[]) {
          breakdownCounts.set(Number(docRow.id), normalizeDocumentRows(docRow.documents, docRow.procurement_files).length);
        }
      } catch { /* 丰富查询失败：静默降级，不影响列表主体 */ }
    }
  }

  // ── 卡片国际化按需翻译：异步写入缓存，不阻塞当前响应（英文回退已即时兜底）──
  const rawRows = rows as RowDataPacket[];
  if (locale && noticesRepo) {
    const missingRows = rawRows.filter((row) => !row.title_i18n);
    const toTranslate = missingRows.slice(0, 9);
    if (toTranslate.length > 0) {
      void Promise.all(
        toTranslate.map(async (row) => {
          try {
            const tr = await getTranslatedNoticeDetail(Number(row.id), locale, noticesRepo, pool);
            row.title_i18n = tr.title || null;
            row.description_i18n = tr.description || null;
          } catch { /* 翻译失败不影响列表主体 */ }
        }),
      );
    }
  }

  const payload: NoticeSearchResult = {
    items: rawRows.map((row) => ({
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
let noticeCountriesCache: { data: Array<{ country: string; count: number }>; expires: number } | null = null;

export async function getNoticeCountries(pool: Pool): Promise<Array<{ country: string; count: number }>> {
  if (noticeCountriesCache && noticeCountriesCache.expires > Date.now()) return noticeCountriesCache.data;
  const [rows] = await pool.query(
    `SELECT n.country, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE (n.is_expired = 0 OR n.is_expired IS NULL) AND n.country IS NOT NULL AND n.country <> ''
     GROUP BY n.country ORDER BY cnt DESC`
  );
  const data = (rows as RowDataPacket[]).map((row) => ({ country: row.country, count: Number(row.cnt) }));
  noticeCountriesCache = { data, expires: Date.now() + 10 * 60 * 1000 };
  return data;
}

// ── 公采池统计 ──
let noticeStatsCache: { data: NoticeStatsResult; expires: number } | null = null;

export interface NoticeStatsResult {
  raw: number;
  active: number;
  bridged: number;
  featured: number;
  bridge_gap: number;
}

export async function getNoticeStats(pool: Pool): Promise<NoticeStatsResult> {
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
  const active = Number((activeRows as RowDataPacket[])[0]?.total || 0);
  const bridged = Number((bridgedRows as RowDataPacket[])[0]?.total || 0);
  const data = {
    raw: Number((rawRows as RowDataPacket[])[0]?.total || 0), active, bridged,
    featured: Number((featuredRows as RowDataPacket[])[0]?.total || 0), bridge_gap: active - bridged,
  };
  noticeStatsCache = { data, expires: Date.now() + 10 * 60 * 1000 };
  return data;
}
