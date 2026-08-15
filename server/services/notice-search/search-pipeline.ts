/**
 * 搜索管道：WHERE 构建 + COUNT + ID 查询 + 详情查询 + 结果格式化
 * Search Pipeline: WHERE building + COUNT + ID query + Detail query + Result formatting
 *
 * @module server/services/notice-search/search-pipeline
 * @description 从 index.ts 提取的搜索管道逻辑，负责 SQL 条件构建、查询执行、结果格式化。
 *              与 Meilisearch 路径选择、缓存管理、翻译触发解耦。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows, escapeLikeWildcard } from "../../utils/normalize";
import { buildNoticeUnspscFilter } from "../unspsc/index";
import { normalizeNoticeType, toBeijingUnixTs } from "../meilisearch/index";
import { isWideTableReady } from "../search-sync/index";
import { DEADLINE_SEC_EXPR, ACTIVE_NOTICE_WHERE_NO_ALIAS } from "../../utils/notice-expired";
import {
  noticeSearchCache, featuredCountCache,
  searchCacheKey, countCacheKey,
  getCountCache, setCountCache,
  NOTICE_SEARCH_CACHE_TTL,
  NOTICE_COUNT_CACHE_TTL, NOTICE_COUNT_CACHE_TTL_KEYWORD,
  FEATURED_COUNT_CACHE_TTL,
  _noticeTypeCache, setNoticeTypeCache, NOTICE_TYPE_CACHE_TTL,
} from "./cache";
import { statsKeyFor, getStatsCount } from "./stats";
import { getAgencyCacheData } from "./agencies";
import { expandCountryAliases, expandCountryAllForms } from "./countries";
import type { NoticeSearchParams, NoticeSearchResult } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 采购类型映射缓存 */
export async function getCachedNoticeTypes(pool: Pool): Promise<string[]> {
  if (_noticeTypeCache && _noticeTypeCache.expires > Date.now()) {
    return _noticeTypeCache.types;
  }
  const [rows] = await pool.query(
    "SELECT DISTINCT notice_type FROM crm_bid_notices WHERE " + ACTIVE_NOTICE_WHERE_NO_ALIAS + " AND notice_type IS NOT NULL"
  );
  const types = (rows as any[]).map((r) => r.notice_type);
  setNoticeTypeCache({ types, expires: Date.now() + NOTICE_TYPE_CACHE_TTL });
  return types;
}

/**
 * 构建 WHERE 条件 + 参数
 */
export async function buildWhereClause(
  pool: Pool,
  p: NoticeSearchParams,
): Promise<{
  where: string[];
  params: any[];
  idFilterSql: string;
  idFilterParams: any[];
  kwUnionSql: string;
  kwUnionParams: any[];
  compactQ: string;
  meiliForceCountryUsed: string;
}> {
  const q = p.q || "";
  const country = p.country || "";
  const agency = p.agency || "";
  const deadlineFrom = p.deadlineFrom || "";
  const deadlineTo = p.deadlineTo || "";
  const noticeType = p.noticeType || "";
  const featuredOnly = !!p.featuredOnly;
  const deadlineWithinDays = p.deadlineWithinDays || 0;
  const isChinese = /[一-鿿]/.test(q);

  const where: string[] = [ACTIVE_NOTICE_WHERE_NO_ALIAS];
  const params: any[] = [];
  let idFilterSql = "";
  const idFilterParams: any[] = [];
  let kwUnionSql = "";
  const kwUnionParams: any[] = [];
  let meiliForceCountryUsed = "";

  // UNSPSC 过滤
  if (p.codeId) {
    const filter = await buildNoticeUnspscFilter(pool, p.codeId);
    idFilterSql = filter.sql;
    idFilterParams.push(...filter.params);
  }

  const compactQ = q.replace(/\s+/g, "").toUpperCase();
  const likeQ = `%${escapeLikeWildcard(q)}%`;

  if (q) {
    if (isChinese) {
      kwUnionSql =
        "SELECT n2.id FROM crm_bid_notices n2 WHERE " + ACTIVE_NOTICE_WHERE_NO_ALIAS + " AND MATCH(n2.title, n2.reference, n2.description) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT qzh.notice_id FROM crm_notice_translations qzh WHERE qzh.lang = 'zh' AND (qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?)";
      kwUnionParams.push(q, likeQ, likeQ);
    } else {
      kwUnionSql =
        "SELECT n2.id FROM crm_bid_notices n2 WHERE " + ACTIVE_NOTICE_WHERE_NO_ALIAS + " AND MATCH(n2.title, n2.reference) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT sn.id FROM crm_bid_notices sn WHERE " + ACTIVE_NOTICE_WHERE_NO_ALIAS + " AND MATCH(sn.description) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT qen.notice_id FROM crm_notice_translations qen WHERE qen.lang = 'en' AND MATCH(qen.title_tr, qen.description_tr) AGAINST(? IN BOOLEAN MODE)";
      kwUnionParams.push(q, q, q);
    }
  }

  if (country) {
    const countryVariants = expandCountryAliases(country);
    if (countryVariants.length > 1) {
      where.push(`UPPER(n.country) IN (${countryVariants.map(() => "?").join(",")})`);
      params.push(...countryVariants);
    } else {
      where.push("UPPER(n.country) = ?");
      params.push(country.toUpperCase());
    }
  }

  if (agency) {
    const _agencyItems = getAgencyCacheData() || [];
    const cachedItem = _agencyItems.find((item) => item.agency === agency);
    if (cachedItem?.agencyGroup?.startsWith("FORCE_COUNTRY_")) {
      const forceCountry = cachedItem.agencyGroup.slice(14);
      meiliForceCountryUsed = forceCountry;
      if (country && country !== forceCountry) {
        console.log(`[search] FORCE_COUNTRY 冲突(MySQL): agency="${agency}" 覆盖 country="${country}" → "${forceCountry}"`);
      }
      const forceCountryVariants = expandCountryAliases(forceCountry);
      if (forceCountryVariants.length > 1) {
        where.push(`UPPER(n.country) IN (${forceCountryVariants.map(() => "?").join(",")})`);
        params.push(...forceCountryVariants);
      } else {
        where.push("UPPER(n.country) = ?");
        params.push(forceCountry.toUpperCase());
      }
    } else if (cachedItem?.sqlPattern) {
      where.push(`UPPER(n.agency) LIKE ?`);
      params.push(cachedItem.sqlPattern);
    } else if (cachedItem?.originalAgencies && cachedItem.originalAgencies.length > 1) {
      const placeholders = cachedItem.originalAgencies.map(() => "?").join(",");
      where.push(`n.agency IN (${placeholders})`);
      params.push(...cachedItem.originalAgencies);
    } else if (cachedItem?.originalAgencies && cachedItem.originalAgencies.length === 1) {
      where.push("n.agency = ?");
      params.push(cachedItem.originalAgencies[0]);
    } else {
      where.push("n.agency = ?");
      params.push(agency);
    }
  }

  if (DATE_RE.test(deadlineFrom)) {
    const ts = toBeijingUnixTs(deadlineFrom, "00:00:00");
    where.push(`${DEADLINE_SEC_EXPR} >= ?`);
    params.push(ts);
  }
  if (DATE_RE.test(deadlineTo)) {
    const ts = toBeijingUnixTs(deadlineTo, "23:59:59");
    where.push(`${DEADLINE_SEC_EXPR} <= ?`);
    params.push(ts);
  }
  if (deadlineWithinDays > 0) {
    const futureTs = Math.floor(Date.now() / 1000) + deadlineWithinDays * 86400;
    where.push(`n.deadline_ts IS NOT NULL AND ${DEADLINE_SEC_EXPR} <= ?`);
    params.push(futureTs);
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

  return { where, params, idFilterSql, idFilterParams, kwUnionSql, kwUnionParams, compactQ, meiliForceCountryUsed };
}

/**
 * 构建 ORDER BY 子句
 */
export function buildOrderByClause(q: string, sort: string, compactQ: string): { orderSql: string; orderParams: any[] } {
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
  return { orderSql: orderParts.join(", "), orderParams };
}

/**
 * 执行 COUNT 查询
 */
export async function executeCountQuery(
  pool: Pool,
  p: NoticeSearchParams,
  whereSql: string,
  params: any[],
  idFilterSql: string,
  idFilterParams: any[],
  kwUnionSql: string,
  kwUnionParams: any[],
  q: string,
  featuredOnly: boolean,
): Promise<{ total: number; countMs: number }> {
  const cKey = countCacheKey(p);
  const isKeyword = !!q;
  const cachedCount = getCountCache(cKey, isKeyword);
  const hasOtherFilters = !!(p.q || p.country || p.agency || p.codeId
    || p.deadlineFrom || p.deadlineTo || p.deadlineWithinDays || p.noticeType);
  const useFeaturedCache = featuredOnly && !hasOtherFilters && featuredCountCache.expires > Date.now();
  const statsKey = statsKeyFor(p);

  const t0 = Date.now();

  if (useFeaturedCache) {
    return { total: featuredCountCache.total, countMs: 0 };
  }

  if (statsKey) {
    const statsTotal = await getStatsCount(pool, statsKey);
    if (statsTotal !== null) {
      if (featuredOnly) {
        featuredCountCache.total = statsTotal;
        featuredCountCache.expires = Date.now() + FEATURED_COUNT_CACHE_TTL;
      } else {
        setCountCache(cKey, isKeyword, statsTotal);
      }
      console.log(`[notice-stats] 统计表命中: key=${statsKey} total=${statsTotal}`);
      return { total: statsTotal, countMs: Date.now() - t0 };
    }
  }

  if (cachedCount !== undefined) {
    return { total: cachedCount, countMs: 0 };
  }

  // 执行实际 COUNT 查询
  let countQuery: string;
  let countParams: any[];
  if (q) {
    countQuery = `SELECT COUNT(*) AS total FROM (${kwUnionSql}) AS _kw INNER JOIN crm_bid_notices n ON n.id = _kw.id ${idFilterSql} WHERE ${whereSql}`;
    countParams = [...kwUnionParams, ...idFilterParams, ...params];
  } else {
    countQuery = `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n ${idFilterSql} WHERE ${whereSql}`;
    countParams = [...idFilterParams, ...params];
  }

  const [result] = await pool.query(countQuery, countParams);
  const total = Number((result as any[])[0]?.total || 0);

  if (featuredOnly) {
    featuredCountCache.total = total;
    featuredCountCache.expires = Date.now() + FEATURED_COUNT_CACHE_TTL;
  } else {
    setCountCache(cKey, isKeyword, total);
  }

  return { total, countMs: Date.now() - t0 };
}

/**
 * 执行 ID 分页查询（MySQL 降级路径）
 */
export async function executeIdQuery(
  pool: Pool,
  whereSql: string,
  orderSql: string,
  params: any[],
  orderParams: any[],
  idFilterParams: any[],
  kwUnionSql: string,
  kwUnionParams: any[],
  q: string,
  pageSize: number,
  offset: number,
): Promise<{ pageIds: number[]; idMs: number }> {
  const t0 = Date.now();
  const MYSQL_TIMEOUT_MS = 15000;

  let idQuery: string;
  let idQueryParams: any[];
  if (q) {
    idQuery = `SELECT n.id FROM crm_bid_notices n ${""} WHERE ${whereSql} AND n.id IN (SELECT id FROM (${kwUnionSql}) AS _u) ORDER BY ${orderSql} LIMIT ? OFFSET ?`;
    idQueryParams = [...idFilterParams, ...params, ...kwUnionParams, ...orderParams, pageSize, offset];
  } else {
    idQuery = `SELECT n.id FROM crm_bid_notices n ${""} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`;
    idQueryParams = [...idFilterParams, ...params, ...orderParams, pageSize, offset];
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`MySQL search timeout after ${MYSQL_TIMEOUT_MS}ms`)), MYSQL_TIMEOUT_MS)
    );

    const [idResult] = await Promise.race([
      pool.query(idQuery, idQueryParams),
      timeoutPromise,
    ]) as [RowDataPacket[], any];

    const pageIds = idResult.map((row) => Number(row.id)).filter(Boolean);
    return { pageIds, idMs: Date.now() - t0 };
  } catch (timeoutErr) {
    console.warn(`[search-perf] MySQL 超时(${MYSQL_TIMEOUT_MS}ms)，返回空结果`);
    return { pageIds: [], idMs: Date.now() - t0 };
  }
}

/**
 * 获取详情行（宽表优先，回退到多表 JOIN）
 */
export async function fetchDetailRows(
  pool: Pool,
  pageIds: number[],
  locale: string,
): Promise<RowDataPacket[]> {
  if (pageIds.length === 0) return [];

  const useWideTable = await isWideTableReady(pool);
  const SUPPORTED_LANGS = ["zh", "en", "fr", "ru", "es", "ar"];
  const lang = locale && SUPPORTED_LANGS.includes(locale) ? locale : "en";

  if (useWideTable) {
    const i18nTitleExpr = `title_${lang}`;
    const i18nDescExpr = `description_${lang}`;
    const [dRows] = await pool.query(
      `SELECT id, notice_id, reference, title, notice_type_std AS notice_type,
         country_std AS country, agency_std AS agency,
         NULLIF(deadline_sec, 0) AS deadline_sec, NULLIF(deadline_sec, 0) AS deadline_ts,
         estimated_value, is_featured,
         LEFT(description, 300) AS description,
         ${i18nTitleExpr} AS title_i18n, LEFT(${i18nDescExpr}, 500) AS description_i18n,
         title_en, LEFT(description_en, 500) AS description_en,
         description_cn, bid_overview, beneficiary_countries,
         documents_count AS breakdown_file_count
       FROM crm_notice_search
       WHERE id IN (${pageIds.map(() => "?").join(",")})
       ORDER BY FIELD(id, ${pageIds.map(() => "?").join(",")})`,
      [...pageIds, ...pageIds]
    );
    return dRows as RowDataPacket[];
  } else {
    // 回退路径：原始多表 JOIN
    const localeParams: any[] = [locale || null];
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
       FROM crm_bid_notices n
       LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?
       LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'
       LEFT JOIN crm_bid_opportunities opp ON opp.source_notice_id = n.notice_id
         AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1)
       WHERE n.id IN (${pageIds.map(() => "?").join(",")})
       ORDER BY FIELD(n.id, ${pageIds.map(() => "?").join(",")})`,
      [...localeParams, ...pageIds, ...pageIds]
    );
    return dRows as RowDataPacket[];
  }
}

/**
 * 格式化搜索结果
 */
export function formatSearchResult(
  detailRows: RowDataPacket[],
  pageIds: number[],
  total: number,
  page: number,
  pageSize: number,
  locale: string,
  featuredOnly: boolean,
  useWideTable: boolean,
): NoticeSearchResult {
  const breakdownCounts = new Map<number, number>();
  const featuredIds = new Set<number>();

  if (pageIds.length > 0) {
    if (featuredOnly) {
      for (const id of pageIds) featuredIds.add(id);
    } else {
      for (const row of detailRows) {
        if (row.is_featured) featuredIds.add(Number(row.id));
        if (useWideTable) {
          const docCount = Number(row.breakdown_file_count) || 0;
          if (docCount > 0) breakdownCounts.set(Number(row.id), docCount);
        } else {
          const docCount = normalizeDocumentRows(row.documents, row.procurement_files).length;
          if (docCount > 0) breakdownCounts.set(Number(row.id), docCount);
        }
      }
    }
  }

  // 机构 i18n
  const agencyCache = getAgencyCacheData();
  const agencyI18nMap = new Map<string, Record<string, string>>();
  if (agencyCache) {
    for (const item of agencyCache) {
      if (item.i18n) agencyI18nMap.set(item.agency, item.i18n);
    }
  }

  return {
    items: detailRows.map((row) => {
      const i18n = agencyI18nMap.get(row.agency);
      return {
        ...row,
        agency_i18n: i18n?.[locale] || undefined,
        organization: null, source_url: null, unspsc_codes: [], core_locked: true,
        is_featured: featuredIds.has(Number(row.id)),
        breakdown_file_count: breakdownCounts.has(Number(row.id)) ? breakdownCounts.get(Number(row.id)) : undefined,
      };
    }),
    total, page, pageSize,
  };
}
