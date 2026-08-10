/**
 * 公采搜索服务 — 编排入口
 * Notice search service — orchestration entry
 *
 * @module server/services/notice-search
 * @description 公告搜索的 SQL WHERE/ORDER 组装与执行；Meilisearch 优先 + MySQL FULLTEXT 降级。
 *              子模块职责：types（类型）、cache（缓存）、countries（国家）、
 *              agencies（机构）、stats（统计/is_active）。本文件仅负责搜索编排。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import { buildNoticeUnspscFilter } from "../unspsc";
import { searchWithFilters as meiliSearch, isHealthy as isMeiliHealthy, normalizeNoticeType } from "../meilisearch";
import type { NoticesRepo } from "../../repos/notices.repo";
import { getTranslatedNoticeDetail } from "../notice-translation";

// ── 子模块 re-export（保持对外 API 不变）──
export type { NoticeSearchParams, NoticeSearchResult, AgencyCacheItem, NoticeStatsResult } from "./types";
export {
  refreshNoticeStats, refreshIsActive, getNoticeStats, statsKeyFor, getStatsCount,
} from "./stats";
export { refreshNoticeCountries, getNoticeCountries } from "./countries";
export { refreshNoticeAgencies, getNoticeAgencies, getAgencyCacheData } from "./agencies";
export {
  noticeSearchCache, noticeCountCache, featuredCountCache,
  searchCacheKey, countCacheKey,
  NOTICE_SEARCH_CACHE_TTL, NOTICE_SEARCH_CACHE_MAX,
  NOTICE_COUNT_CACHE_TTL, NOTICE_COUNT_CACHE_MAX,
  FEATURED_COUNT_CACHE_TTL,
} from "./cache";

// ── 内部引用 ──
import {
  noticeSearchCache, noticeCountCache, featuredCountCache,
  searchCacheKey, countCacheKey,
  NOTICE_SEARCH_CACHE_TTL, NOTICE_SEARCH_CACHE_MAX,
  NOTICE_COUNT_CACHE_TTL, NOTICE_COUNT_CACHE_MAX,
  FEATURED_COUNT_CACHE_TTL,
  _noticeTypeCache, setNoticeTypeCache, NOTICE_TYPE_CACHE_TTL,
} from "./cache";
import { statsKeyFor, getStatsCount } from "./stats";
import { getAgencyCacheData } from "./agencies";
import type { NoticeSearchParams, NoticeSearchResult } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEADLINE_SEC_EXPR = "n.deadline_sec";

// ── 采购类型映射缓存：避免每次 DISTINCT 查询冷启动 5s ──
async function getCachedNoticeTypes(pool: Pool): Promise<string[]> {
  if (_noticeTypeCache && _noticeTypeCache.expires > Date.now()) {
    return _noticeTypeCache.types;
  }
  const [rows] = await pool.query(
    "SELECT DISTINCT notice_type FROM crm_bid_notices WHERE is_active = 1 AND notice_type IS NOT NULL"
  );
  const types = (rows as any[]).map((r) => r.notice_type);
  setNoticeTypeCache({ types, expires: Date.now() + NOTICE_TYPE_CACHE_TTL });
  return types;
}

/**
 * 搜索公告（主编排函数）
 * Meilisearch 优先 → MySQL FULLTEXT 降级 → 两阶段查询（ID 分页 + 按 ID 取详情）
 */
export async function searchNotices(
  pool: Pool,
  p: NoticeSearchParams,
  noticesRepo?: NoticesRepo,
): Promise<NoticeSearchResult> {
  const { page, pageSize } = p;
  const offset = (page - 1) * pageSize;
  const q = p.q || "";
  const country = p.country || "";
  const agency = p.agency || "";
  const deadlineFrom = p.deadlineFrom || "";
  const deadlineTo = p.deadlineTo || "";
  const sort = p.sort || "deadline_farthest";
  const deadlineWithinDays = p.deadlineWithinDays || 0;
  const noticeType = p.noticeType || "";
  const featuredOnly = !!p.featuredOnly;
  const locale = p.locale || "";

  const cacheKey = searchCacheKey(p);
  const cached = noticeSearchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.payload;

  // ── Meilisearch 优先路径 ──
  let meiliHit = false;
  let total = 0;
  let pageIds: number[] = [];
  let countMs = 0;
  let idMs = 0;
  let searchMode = "mysql";

  const isChinese = /[\u4e00-\u9fff]/.test(q);

  // ── UNSPSC 行业分类预解析 ──
  let unspscLevel = 0;
  let unspscLevelId = "";
  if (p.codeId && isMeiliHealthy()) {
    try {
      const [codeRows] = await pool.query(
        "SELECT id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
        [p.codeId]
      );
      const codeRow = (codeRows as any[])[0];
      if (codeRow) {
        unspscLevel = Number(codeRow.level) || 0;
        unspscLevelId = String(codeRow.id);
      }
    } catch { /* Meilisearch 降级到 MySQL 桥接表 */ }
  }
  const meiliCanHandleUnspsc = unspscLevel >= 1 && unspscLevel <= 5 && !!unspscLevelId;

  // PERF 优化：Meilisearch 统一处理关键词 + 筛选 + 排序 + 分页
  // BUG 修复：中文关键词不走 Meilisearch（Meilisearch 中文分词不准确，会返回所有文档）
  // 中文关键词走 MySQL FULLTEXT + ngram 路径，确保正确匹配
  if (!p.codeId && isMeiliHealthy() && !isChinese) {
    const meiliStart = Date.now();
    let meiliAgencies: string[] | undefined;
    let meiliAgencyGroup: string | undefined;
    if (agency) {
      const _items = getAgencyCacheData() || [];
      const _cached = _items.find((item) => item.agency === agency);
      if (_cached?.agencyGroup) {
        meiliAgencyGroup = _cached.agencyGroup;
      } else if (_cached?.originalAgencies && _cached.originalAgencies.length > 0) {
        meiliAgencies = _cached.originalAgencies;
      } else {
        meiliAgencies = [agency];
      }
    }
    const meiliResult = await meiliSearch({
      q: q || undefined,
      country: country || undefined,
      agencies: meiliAgencies,
      agencyGroup: meiliAgencyGroup,
      deadlineFrom: deadlineFrom || undefined,
      deadlineTo: deadlineTo || undefined,
      deadlineWithinDays: deadlineWithinDays || undefined,
      noticeType: noticeType || undefined,
      featuredOnly: featuredOnly || undefined,
      sort,
      page,
      pageSize,
    });
    if (meiliResult) {
      meiliHit = true;
      total = meiliResult.total;
      pageIds = meiliResult.ids;
      const meiliMs = Date.now() - meiliStart;
      searchMode = q ? (isChinese ? "meili-zh" : "meili-en") : "meili-filter";
      console.log(`[search-perf] mode=${searchMode} page=${p.page} q="${q}" country="${country}" agency="${agency}"` +
        (meiliAgencyGroup ? ` agencyGroup="${meiliAgencyGroup}"` : "") +
        ` | Meilisearch=${meiliMs}ms | total=${total} | ids=${pageIds.length}`);
    }
  }

  // ── MySQL FULLTEXT 降级路径 ──
  if (!meiliHit) {
    searchMode = q ? (isChinese ? "mysql-zh-FULLTEXT" : "mysql-en-FULLTEXT") : "mysql-none";
    console.log(`[search-perf] fallback MySQL mode=${searchMode} q="${q}" country="${country}"`);
  }

  const where: string[] = ["n.is_active = 1"];
  const params: any[] = [];
  let join = "";
  let idFilterSql = "";
  const idFilterParams: any[] = [];

  if (p.codeId) {
    // PERF 优化：当 Meilisearch 能处理 UNSPSC 时，无论是否有关键词，都走 Meilisearch
    // 原逻辑：只有 !q 时才走 Meilisearch，导致关键词+UNSPSC 组合走 MySQL 桥接表（慢）
    // 修复后：Meilisearch 同时处理关键词 + UNSPSC 筛选，避免 MySQL 桥接表查询
    if (meiliCanHandleUnspsc && !isChinese) {
      let unspscAgencies: string[] | undefined;
      let unspscAgencyGroup: string | undefined;
      if (agency) {
        const _items = getAgencyCacheData() || [];
        const _cached = _items.find((item) => item.agency === agency);
        if (_cached?.agencyGroup) {
          unspscAgencyGroup = _cached.agencyGroup;
        } else if (_cached?.originalAgencies?.length) {
          unspscAgencies = _cached.originalAgencies;
        } else {
          unspscAgencies = [agency];
        }
      }
      const unspscStart = Date.now();
      const unspscResult = await meiliSearch({
        q: q || undefined,
        country: country || undefined,
        agencies: unspscAgencies,
        agencyGroup: unspscAgencyGroup,
        deadlineFrom: deadlineFrom || undefined,
        deadlineTo: deadlineTo || undefined,
        deadlineWithinDays: deadlineWithinDays || undefined,
        noticeType: noticeType || undefined,
        featuredOnly: featuredOnly || undefined,
        unspscLevel, unspscLevelId,
        sort, page, pageSize,
      });
      if (unspscResult) {
        meiliHit = true;
        total = unspscResult.total;
        pageIds = unspscResult.ids;
        searchMode = q ? (isChinese ? "meili-unspsc-zh" : "meili-unspsc-en") : "meili-unspsc";
        const unspscMs = Date.now() - unspscStart;
        console.log(`[search-perf] mode=${searchMode} codeId=${p.codeId} q="${q}" | Meilisearch=${unspscMs}ms | total=${total}`);
      } else {
        const filter = await buildNoticeUnspscFilter(pool, p.codeId);
        idFilterSql = filter.sql;
        idFilterParams.push(...filter.params);
      }
    } else {
      const filter = await buildNoticeUnspscFilter(pool, p.codeId);
      idFilterSql = filter.sql;
      idFilterParams.push(...filter.params);
    }
  }

  const compactQ = q.replace(/\s+/g, "").toUpperCase();
  const likeQ = `%${q}%`;
  let kwUnionSql = "";
  const kwUnionParams: any[] = [];

  if (q) {
    if (isChinese) {
      kwUnionSql =
        "SELECT n2.id FROM crm_bid_notices n2 WHERE n2.is_active = 1 AND MATCH(n2.title, n2.reference, n2.description) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT qzh.notice_id FROM crm_notice_translations qzh WHERE qzh.lang = 'zh' AND (qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?)";
      kwUnionParams.push(q, likeQ, likeQ);
    } else {
      kwUnionSql =
        "SELECT n2.id FROM crm_bid_notices n2 WHERE n2.is_active = 1 AND MATCH(n2.title, n2.reference) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT sn.id FROM crm_bid_notices sn WHERE sn.is_active = 1 AND MATCH(sn.description) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT qen.notice_id FROM crm_notice_translations qen WHERE qen.lang = 'en' AND MATCH(qen.title_tr, qen.description_tr) AGAINST(? IN BOOLEAN MODE)";
      kwUnionParams.push(q, q, q);
    }
  }
  if (country) {
    where.push("n.country = ?");
    params.push(country);
  }
  if (agency) {
    const _agencyItems = getAgencyCacheData() || [];
    const cachedItem = _agencyItems.find((item) => item.agency === agency);
    if (cachedItem?.originalAgencies && cachedItem.originalAgencies.length > 1) {
      const AGENCY_IN_LIMIT = 100;
      if (cachedItem.originalAgencies.length > AGENCY_IN_LIMIT && country) {
        console.log(`[noticeSearch] agency 聚合优化: ${cachedItem.originalAgencies.length} 个原始机构名 + country="${country}" → 跳过机构 IN`);
      } else if (cachedItem.originalAgencies.length > AGENCY_IN_LIMIT) {
        const truncated = cachedItem.originalAgencies.slice(0, AGENCY_IN_LIMIT);
        const placeholders = truncated.map(() => "?").join(",");
        where.push(`n.agency IN (${placeholders})`);
        params.push(...truncated);
        console.log(`[noticeSearch] agency 截断优化: ${cachedItem.originalAgencies.length} → ${AGENCY_IN_LIMIT} 个`);
      } else {
        const placeholders = cachedItem.originalAgencies.map(() => "?").join(",");
        where.push(`n.agency IN (${placeholders})`);
        params.push(...cachedItem.originalAgencies);
      }
    } else if (cachedItem?.originalAgencies && cachedItem.originalAgencies.length === 1) {
      where.push("n.agency = ?");
      params.push(cachedItem.originalAgencies[0]);
    } else {
      where.push("n.agency = ?");
      params.push(agency);
    }
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
    try {
      const allTypes = await getCachedNoticeTypes(pool);
      const normalizedInput = normalizeNoticeType(noticeType);
      const matchingTypes = allTypes.filter((t) => normalizeNoticeType(t) === normalizedInput);
      if (matchingTypes.length > 0) {
        where.push(`n.notice_type IN (${matchingTypes.map(() => "?").join(",")})`);
        params.push(...matchingTypes);
      } else {
        where.push("1 = 0");
      }
    } catch (err) {
      console.warn(`[noticeSearch] noticeType 预解析失败，跳过该筛选: ${(err as Error).message}`);
    }
  }
  if (featuredOnly) {
    where.push("n.is_featured = 1");
  }

  const localeParams: any[] = [];
  let displayJoin = "";
  displayJoin += " LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?";
  localeParams.push(locale || null);
  displayJoin += " LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  const countJoin = idFilterSql;

  const orderParts: string[] = [];
  const orderParams: any[] = [];
  if (q) {
    orderParts.push("(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ?) DESC");
    orderParams.push(compactQ);
  }
  if (sort === "latest") {
    orderParts.push("n.id DESC");
  } else if (sort === "deadline_farthest") {
    orderParts.push(`${DEADLINE_SEC_EXPR} IS NULL`, `${DEADLINE_SEC_EXPR} DESC`, "n.id DESC");
  } else {
    orderParts.push(`${DEADLINE_SEC_EXPR} IS NULL`, DEADLINE_SEC_EXPR, "n.id DESC");
  }
  const orderSql = orderParts.join(", ");
  const whereSql = where.join(" AND ");

  // ── COUNT 查询（优先级链：精选缓存 → 统计表 → COUNT缓存 → COUNT查询）──
  const cKey = countCacheKey(p);
  const cachedCount = noticeCountCache.get(cKey);
  const useCachedCount = cachedCount && cachedCount.expires > Date.now();
  const hasOtherFilters = !!(p.q || p.country || p.agency || p.codeId
    || p.deadlineFrom || p.deadlineTo || p.deadlineWithinDays || p.noticeType);
  const useFeaturedCache = featuredOnly && !hasOtherFilters && featuredCountCache.expires > Date.now();

  let countPromise: Promise<any>;
  const statsKey = statsKeyFor(p);
  if (useFeaturedCache) {
    countPromise = Promise.resolve([[{ total: featuredCountCache.total }]]);
  } else if (statsKey) {
    countPromise = getStatsCount(pool, statsKey).then((statsTotal) => {
      if (statsTotal !== null) {
        if (featuredOnly) {
          featuredCountCache.total = statsTotal;
          featuredCountCache.expires = Date.now() + FEATURED_COUNT_CACHE_TTL;
        } else {
          noticeCountCache.set(cKey, { total: statsTotal, expires: Date.now() + NOTICE_COUNT_CACHE_TTL });
        }
        console.log(`[notice-stats] 统计表命中: key=${statsKey} total=${statsTotal}`);
        return [[{ total: statsTotal }]];
      }
      if (useCachedCount) {
        return [[{ total: cachedCount!.total }]];
      }
      return runCountQuery();
    });
  } else if (useCachedCount) {
    countPromise = Promise.resolve([[{ total: cachedCount.total }]]);
  } else {
    countPromise = runCountQuery();
  }

  function runCountQuery(): Promise<any> {
    let countQuery: string;
    let countParams: any[];
    if (q) {
      countQuery = `SELECT COUNT(*) AS total FROM (${kwUnionSql}) AS _kw INNER JOIN crm_bid_notices n ON n.id = _kw.id ${countJoin} WHERE ${whereSql}`;
      countParams = [...kwUnionParams, ...idFilterParams, ...params];
    } else {
      countQuery = `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n ${countJoin} WHERE ${whereSql}`;
      countParams = [...idFilterParams, ...params];
    }
    return pool.query(countQuery, countParams).then((result: any) => {
      const t = Number((result[0] as any[])[0]?.total || 0);
      if (featuredOnly) {
        featuredCountCache.total = t;
        featuredCountCache.expires = Date.now() + FEATURED_COUNT_CACHE_TTL;
      } else {
        noticeCountCache.set(cKey, { total: t, expires: Date.now() + NOTICE_COUNT_CACHE_TTL });
      }
      return result;
    });
  }

  // ── 性能监控 ──
  const t0 = Date.now();
  let t1 = t0;

  if (!meiliHit) {
    const countTimed = countPromise.then((r: any) => { countMs = Date.now() - t0; return r; });
    const idQueryStart = Date.now();
    let idQuery: string;
    let idQueryParams: any[];
    if (q) {
      idQuery = `SELECT n.id FROM crm_bid_notices n ${countJoin} WHERE ${whereSql} AND n.id IN (SELECT id FROM (${kwUnionSql}) AS _u) ORDER BY ${orderSql} LIMIT ? OFFSET ?`;
      idQueryParams = [...idFilterParams, ...params, ...kwUnionParams, ...orderParams, pageSize, offset];
    } else {
      idQuery = `SELECT n.id FROM crm_bid_notices n ${countJoin} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`;
      idQueryParams = [...idFilterParams, ...params, ...orderParams, pageSize, offset];
    }
    const idTimed = pool.query(idQuery, idQueryParams)
      .then((r: any) => { idMs = Date.now() - idQueryStart; return r; });

    const [countResult, idResult] = await Promise.all([countTimed, idTimed]);
    t1 = Date.now();
    const [countRows] = countResult;
    const [idRows] = idResult;
    total = Number((countRows as RowDataPacket[])[0]?.total || 0);
    pageIds = (idRows as RowDataPacket[]).map((row) => Number(row.id)).filter(Boolean);
  }

  // 阶段 2：按 ID 批量获取详情
  let detailRows: RowDataPacket[] = [];
  if (pageIds.length > 0) {
    const [dRows] = await pool.query(
      `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
         n.deadline, n.deadline_ts, n.deadline_sec, n.estimated_value, n.agency,
         n.is_featured, n.documents, n.procurement_files,
         LEFT(n.description, 300) AS description,
         tr.title_tr AS title_i18n, tr.description_tr AS description_i18n,
         tre.title_tr AS title_en, tre.description_tr AS description_en,
         opp.description_cn,
         LEFT(opp.bid_overview, 200) AS bid_overview,
         opp.beneficiary_countries
       FROM crm_bid_notices n ${displayJoin}
       LEFT JOIN crm_bid_opportunities opp ON opp.source_notice_id = n.notice_id
         AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1)
       WHERE n.id IN (${pageIds.map(() => "?").join(",")})
       ORDER BY FIELD(n.id, ${pageIds.map(() => "?").join(",")})`,
      [...localeParams, ...pageIds, ...pageIds]
    );
    detailRows = dRows as RowDataPacket[];
  }

  const t2 = Date.now();

  // P1 性能优化：最后一页短路
  const lastPageShortCircuit = pageIds.length > 0 && pageIds.length < pageSize;
  if (lastPageShortCircuit) {
    total = offset + pageIds.length;
    countMs = 0;
    console.log(`[search-perf] COUNT 短路: page=${page} items=${pageIds.length} < pageSize=${pageSize} → total=${total} (0ms)`);
  }

  // P0：首页写入 COUNT 缓存
  if (page === 1 && total > 0) {
    if (noticeCountCache.size >= NOTICE_COUNT_CACHE_MAX) {
      const now = Date.now();
      for (const [key, entry] of noticeCountCache) { if (entry.expires <= now) noticeCountCache.delete(key); }
      if (noticeCountCache.size >= NOTICE_COUNT_CACHE_MAX) noticeCountCache.clear();
    }
    noticeCountCache.set(cKey, { total, expires: Date.now() + NOTICE_COUNT_CACHE_TTL });
  }

  const breakdownCounts = new Map<number, number>();
  const featuredIds = new Set<number>();
  if (pageIds.length > 0) {
    if (featuredOnly) {
      for (const id of pageIds) featuredIds.add(id);
    } else {
      for (const row of detailRows) {
        if (row.is_featured) featuredIds.add(Number(row.id));
        const docCount = normalizeDocumentRows(row.documents, row.procurement_files).length;
        if (docCount > 0) breakdownCounts.set(Number(row.id), docCount);
      }
    }
  }

  // ── 卡片国际化按需翻译：异步写入缓存，不阻塞当前响应 ──
  const rawRows = detailRows;
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

  const t3 = Date.now();

  // P2-2 修复：缓存中剥离翻译字段
  const cachePayload: NoticeSearchResult = {
    items: rawRows.map((row) => ({
      ...row, title_i18n: null, description_i18n: null,
      organization: null, source_url: null, unspsc_codes: [], core_locked: true,
      is_featured: featuredIds.has(Number(row.id)),
      breakdown_file_count: breakdownCounts.has(Number(row.id)) ? breakdownCounts.get(Number(row.id)) : undefined,
    })),
    total, page, pageSize,
  };
  const payload: NoticeSearchResult = {
    items: rawRows.map((row) => ({
      ...row, organization: null, source_url: null, unspsc_codes: [], core_locked: true,
      is_featured: featuredIds.has(Number(row.id)),
      breakdown_file_count: breakdownCounts.has(Number(row.id)) ? breakdownCounts.get(Number(row.id)) : undefined,
    })),
    total, page, pageSize,
  };

  console.log(`[search-perf] mode=${searchMode} page=${page} q="${q}" country="${country}" codeId=${p.codeId || "-"} featured=${featuredOnly}` +
    ` | COUNT=${countMs}ms | IDs=${idMs}ms | Phase1=${t1 - t0}ms | Phase2=${t2 - t1}ms | Phase3=${t3 - t2}ms | TOTAL=${t3 - t0}ms`);

  if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) {
    const now = Date.now();
    for (const [key, entry] of noticeSearchCache) { if (entry.expires <= now) noticeSearchCache.delete(key); }
    if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) noticeSearchCache.clear();
  }
  noticeSearchCache.set(cacheKey, { payload: cachePayload, expires: Date.now() + NOTICE_SEARCH_CACHE_TTL });

  return payload;
}

// ── 测试辅助：清除所有模块级缓存 ──
import { clearAllCaches } from "./cache";
import { clearCountriesCache } from "./countries";
import { clearAgenciesCache } from "./agencies";
import { clearStatsCache } from "./stats";

export function __testClearAllCaches(): void {
  clearAllCaches();
  clearCountriesCache();
  clearAgenciesCache();
  clearStatsCache();
}
