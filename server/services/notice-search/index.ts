/**
 * 公采搜索服务 — 编排入口
 * Notice search service — orchestration entry
 *
 * @module server/services/notice-search
 * @description 公告搜索的编排层，协调 Meilisearch 优先路径、MySQL 降级路径、缓存管理、翻译触发。
 *              子模块职责：types（类型）、cache（缓存）、countries（国家）、
 *              agencies（机构）、stats（统计）、search-pipeline（SQL 管道）、translation-trigger（补翻）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { searchWithFilters as meiliSearch, isHealthy as isMeiliHealthy } from "../meilisearch";
import type { NoticesRepo } from "../../repos/notices.repo";
import { isWideTableReady } from "../noticeSearchSync";

// ── 子模块 re-export（保持对外 API 不变）──
export type { NoticeSearchParams, NoticeSearchResult, AgencyCacheItem, NoticeStatsResult } from "./types";
export {
  refreshNoticeStats, getNoticeStats, statsKeyFor, getStatsCount,
} from "./stats";
export { refreshNoticeCountries, getNoticeCountries, expandCountryAliases, expandCountryAllForms } from "./countries";
export { refreshNoticeAgencies, getNoticeAgencies, getAgencyCacheData } from "./agencies";
export {
  noticeSearchCache, featuredCountCache,
  searchCacheKey, countCacheKey,
  getCountCache, setCountCache,
  NOTICE_SEARCH_CACHE_TTL, NOTICE_SEARCH_CACHE_MAX,
  NOTICE_COUNT_CACHE_TTL, NOTICE_COUNT_CACHE_TTL_KEYWORD, NOTICE_COUNT_CACHE_MAX,
  FEATURED_COUNT_CACHE_TTL,
} from "./cache";

// ── 内部引用 ──
import {
  noticeSearchCache,
  searchCacheKey,
  setCountCache,
  countCacheKey,
} from "./cache";
import { getAgencyCacheData } from "./agencies";
import { expandCountryAllForms } from "./countries";
import type { NoticeSearchParams, NoticeSearchResult } from "./types";
import {
  buildWhereClause, buildOrderByClause, executeCountQuery,
  executeIdQuery, fetchDetailRows, formatSearchResult,
} from "./search-pipeline";
import { triggerBackTranslation } from "./translation-trigger";

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
  const sort = p.sort || "deadline_farthest";
  const featuredOnly = !!p.featuredOnly;
  const locale = p.locale || "";

  const cacheKey = searchCacheKey(p);
  const cached = noticeSearchCache.get(cacheKey);
  if (cached) return cached;

  // ── 搜索状态变量 ──
  let meiliHit = false;
  let total = 0;
  let pageIds: number[] = [];
  let countMs = 0;
  let idMs = 0;
  let searchMode = "mysql";
  let meiliForceCountryUsed = "";

  // ── 参考号精确匹配快速路径 ──
  let referenceHit = false;
  if (q) {
    const trimmedQ = q.trim();
    try {
      const wideReady = await isWideTableReady(pool);
      if (wideReady) {
        const [refRows] = await pool.query(
          `SELECT id FROM crm_notice_search
           WHERE reference = ?
             AND (deadline_sec = 0 OR deadline_sec >= UNIX_TIMESTAMP(NOW()))
           LIMIT 1`,
          [trimmedQ]
        );
        if ((refRows as any[]).length > 0) {
          referenceHit = true;
          total = 1;
          pageIds = [Number((refRows as any[])[0].id)];
          searchMode = "ref-exact";
          console.log(`[search-perf] mode=ref-exact page=1 q="${q}" | 参考号精确匹配命中 id=${pageIds[0]} (<1ms)`);
        }
      }
    } catch {
      // 快速路径失败，静默降级
    }
  }

  // ── FORCE_COUNTRY 冲突检测 ──
  if (!referenceHit && country && agency) {
    const _checkItems = getAgencyCacheData() || [];
    const _checkCached = _checkItems.find((item) => item.agency === agency);
    if (_checkCached?.agencyGroup?.startsWith("FORCE_COUNTRY_")) {
      const forceCountry = _checkCached.agencyGroup.slice(14);
      const countryUpperForms = expandCountryAllForms(country).map(f => f.toUpperCase());
      if (!countryUpperForms.includes(forceCountry.toUpperCase())) {
        console.log(`[search] FORCE_COUNTRY 矛盾: agency="${agency}" 要求 country="${forceCountry}"，用户选择 country="${country}" → 返回空结果`);
        const emptyResult: NoticeSearchResult = { items: [], total: 0, page, pageSize };
        noticeSearchCache.set(cacheKey, emptyResult);
        return emptyResult;
      }
    }
  }

  // ── Meilisearch 统一优先路径 ──
  const isChinese = /[一-鿿]/.test(q);

  // UNSPSC 预解析
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
    } catch { /* Meilisearch 降级 */ }
  }
  const meiliCanHandleUnspsc = unspscLevel >= 1 && unspscLevel <= 5 && !!unspscLevelId;
  const skipMeiliForUnspsc = p.codeId && !meiliCanHandleUnspsc;

  if (!referenceHit && isMeiliHealthy() && !skipMeiliForUnspsc) {
    let meiliAgencies: string[] | undefined;
    let meiliAgencyGroup: string | undefined;
    let meiliForceCountry: string | undefined;
    if (agency) {
      const _items = getAgencyCacheData() || [];
      const _cached = _items.find((item) => item.agency === agency);
      if (_cached?.agencyGroup?.startsWith("FORCE_COUNTRY_")) {
        meiliForceCountry = _cached.agencyGroup.slice(14);
        if (country && country !== meiliForceCountry) {
          console.log(`[search] FORCE_COUNTRY 冲突: agency="${agency}" 要求 country="${meiliForceCountry}"，用户选择 country="${country}" → 返回空结果`);
          const emptyResult: NoticeSearchResult = { items: [], total: 0, page, pageSize };
          noticeSearchCache.set(cacheKey, emptyResult);
          return emptyResult;
        }
        meiliForceCountryUsed = meiliForceCountry;
      } else if (_cached?.agencyGroup && !_cached.agencyGroup.startsWith("ORPHAN_")) {
        meiliAgencyGroup = _cached.agencyGroup;
      } else if (_cached?.originalAgencies && _cached.originalAgencies.length > 0) {
        meiliAgencies = _cached.originalAgencies;
      } else {
        meiliAgencies = [agency];
      }
    }

    const meiliStart = Date.now();
    const effectiveCountry = meiliForceCountry || country || undefined;
    const meiliResult = await meiliSearch({
      q: q || undefined,
      country: effectiveCountry,
      countryVariants: effectiveCountry ? expandCountryAllForms(effectiveCountry) : undefined,
      agencies: meiliAgencies,
      agencyGroup: meiliAgencyGroup,
      deadlineFrom: p.deadlineFrom || undefined,
      deadlineTo: p.deadlineTo || undefined,
      deadlineWithinDays: p.deadlineWithinDays || undefined,
      noticeType: p.noticeType || undefined,
      featuredOnly: featuredOnly || undefined,
      unspscLevel: meiliCanHandleUnspsc ? unspscLevel : undefined,
      unspscLevelId: meiliCanHandleUnspsc ? unspscLevelId : undefined,
      sort,
      page,
      pageSize,
    });

    if (meiliResult) {
      meiliHit = true;
      pageIds = meiliResult.ids;
      const meiliMs = Date.now() - meiliStart;

      if (p.codeId) {
        searchMode = meiliCanHandleUnspsc
          ? (q ? (isChinese ? "meili-unspsc-zh" : "meili-unspsc-en") : "meili-unspsc")
          : "meili-no-unspsc";
      } else {
        searchMode = q ? (isChinese ? "meili-zh" : "meili-en") : "meili-filter";
      }

      if (meiliResult.totalIsPrecise && meiliResult.total > 0) {
        total = meiliResult.total;
        countMs = 0;
      }

      console.log(`[search-perf] mode=${searchMode} page=${p.page} q="${q}" country="${country}" agency="${agency}"` +
        (meiliAgencyGroup ? ` agencyGroup="${meiliAgencyGroup}"` : "") +
        (p.codeId ? ` codeId=${p.codeId}` : "") +
        (p.noticeType ? ` noticeType="${p.noticeType}"` : "") +
        ` sort=${sort}` +
        ` | Meilisearch=${meiliMs}ms | total=${total} precise=${meiliResult.totalIsPrecise} | ids=${pageIds.length}`);
    } else {
      console.warn(`[search-perf] Meilisearch 返回 null，降级到 MySQL | q="${q}" country="${country}" codeId=${p.codeId || "-"}`);
    }
  }

  // ── MySQL 降级路径 ──
  if (!meiliHit && !referenceHit) {
    searchMode = q ? (isChinese ? "mysql-zh-FULLTEXT" : "mysql-en-FULLTEXT") : "mysql-none";
    console.log(`[search-perf] fallback MySQL mode=${searchMode} q="${q}" country="${country}"`);

    const t0 = Date.now();

    // 构建 WHERE
    const { where, params, idFilterSql, idFilterParams, kwUnionSql, kwUnionParams, compactQ, meiliForceCountryUsed: mysqlForceCountry } =
      await buildWhereClause(pool, p);
    meiliForceCountryUsed = mysqlForceCountry;
    const whereSql = where.join(" AND ");

    // 构建 ORDER BY
    const { orderSql, orderParams } = buildOrderByClause(q, sort, compactQ);

    // 并行执行 COUNT + ID 查询
    const countPromise = executeCountQuery(pool, p, whereSql, params, idFilterSql, idFilterParams, kwUnionSql, kwUnionParams, q, featuredOnly);
    const idPromise = executeIdQuery(pool, whereSql, orderSql, params, orderParams, idFilterParams, kwUnionSql, kwUnionParams, q, pageSize, offset);

    const [countResult, idResult] = await Promise.all([countPromise, idPromise]);
    total = countResult.total;
    countMs = countResult.countMs;
    pageIds = idResult.pageIds;
    idMs = idResult.idMs;

    const t1 = Date.now();
    console.log(`[search-perf] mode=${searchMode} | COUNT=${countMs}ms | IDs=${idMs}ms | Phase1=${t1 - t0}ms`);
  }

  // ── Meilisearch 空命中校准 ──
  if (meiliHit && pageIds.length === 0 && !referenceHit) {
    try {
      const CALIBRATE_TIMEOUT_MS = p.codeId ? 15000 : 5000;
      const { where, params, idFilterSql, idFilterParams, kwUnionSql, kwUnionParams, compactQ } =
        await buildWhereClause(pool, p);
      const whereSql = where.join(" AND ");
      const { orderSql, orderParams } = buildOrderByClause(q, sort, compactQ);

      const calibrateCount = await Promise.race([
        executeCountQuery(pool, p, whereSql, params, idFilterSql, idFilterParams, kwUnionSql, kwUnionParams, q, featuredOnly),
        new Promise<{ total: number; countMs: number } | null>((resolve) => setTimeout(() => resolve(null), CALIBRATE_TIMEOUT_MS)),
      ]);

      if (calibrateCount && calibrateCount.total > offset) {
        const fallbackResult = await executeIdQuery(pool, whereSql, orderSql, params, orderParams, idFilterParams, kwUnionSql, kwUnionParams, q, pageSize, offset);
        if (fallbackResult.pageIds.length > 0) {
          pageIds = fallbackResult.pageIds;
          searchMode = `${searchMode}-id-fallback`;
          console.log(`[search-perf] Meilisearch 空命中校准: COUNT=${calibrateCount.total} → MySQL 取 ${fallbackResult.pageIds.length} 条 ID`);
        }
      }
    } catch (err) {
      console.warn(`[search-perf] Meilisearch 空命中校准失败: ${(err as Error).message}`);
    }
  }

  // ── 阶段 2：获取详情 ──
  const t2 = Date.now();
  const detailRows = await fetchDetailRows(pool, pageIds, locale);
  const t3 = Date.now();

  // ── COUNT 超时处理 ──
  if (!referenceHit && !(meiliHit && total > 0 && countMs === 0)) {
    const COUNT_TIMEOUT_MS = p.codeId ? 15000 : 5000;
    try {
      const { where, params, idFilterSql, idFilterParams, kwUnionSql, kwUnionParams } =
        await buildWhereClause(pool, p);
      const whereSql = where.join(" AND ");
      const countResult = await Promise.race([
        executeCountQuery(pool, p, whereSql, params, idFilterSql, idFilterParams, kwUnionSql, kwUnionParams, q, featuredOnly),
        new Promise<{ total: number; countMs: number } | null>((resolve) => setTimeout(() => resolve(null), COUNT_TIMEOUT_MS)),
      ]);
      if (countResult) {
        total = countResult.total;
        countMs = countResult.countMs;
      } else {
        if (meiliHit && total === 0) {
          console.warn(`[search-perf] COUNT 查询超时(${COUNT_TIMEOUT_MS}ms)，使用 Meilisearch 估算值`);
        } else {
          console.warn(`[search-perf] COUNT 查询超时(${COUNT_TIMEOUT_MS}ms)`);
          total = 0;
        }
      }
    } catch {
      total = 0;
    }
  }

  // 最后一页短路
  const lastPageShortCircuit = pageIds.length > 0 && pageIds.length < pageSize;
  if (lastPageShortCircuit) {
    total = offset + pageIds.length;
    countMs = 0;
    console.log(`[search-perf] COUNT 短路: page=${page} items=${pageIds.length} < pageSize=${pageSize} → total=${total}`);
  }

  // 首页写入 COUNT 缓存
  if (page === 1 && total > 0) {
    const cKey = countCacheKey(p);
    setCountCache(cKey, !!q, total);
  }

  // ── 格式化结果 ──
  const useWideTable = await isWideTableReady(pool);
  const payload = formatSearchResult(detailRows, pageIds, total, page, pageSize, locale, featuredOnly, useWideTable);

  console.log(`[search-perf] mode=${searchMode} page=${page} q="${q}" country="${country}" codeId=${p.codeId || "-"} featured=${featuredOnly}` +
    (p.noticeType ? ` noticeType="${p.noticeType}"` : "") +
    ` sort=${sort}` +
    ` | COUNT=${countMs}ms | IDs=${idMs}ms | Phase2=${t3 - t2}ms | TOTAL=${t3 - (t2 - (t3 - t2))}ms`);

  // ── 按需补翻（异步，不阻塞响应）──
  if (locale && noticesRepo) {
    triggerBackTranslation(detailRows, locale, noticesRepo, pool);
  }

  noticeSearchCache.set(cacheKey, payload);
  return payload;
}

// ── 测试辅助 ──
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
