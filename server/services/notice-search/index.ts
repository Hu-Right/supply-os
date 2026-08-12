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
import { searchWithFilters as meiliSearch, isHealthy as isMeiliHealthy, normalizeNoticeType, toBeijingUnixTs } from "../meilisearch";
import type { NoticesRepo } from "../../repos/notices.repo";
import { getTranslatedNoticeDetail } from "../notice-translation";
import { isWideTableReady } from "../noticeSearchSync";

// ── 子模块 re-export（保持对外 API 不变）──
export type { NoticeSearchParams, NoticeSearchResult, AgencyCacheItem, NoticeStatsResult } from "./types";
export {
  refreshNoticeStats, getNoticeStats, statsKeyFor, getStatsCount,
} from "./stats";
export { refreshNoticeCountries, getNoticeCountries, expandCountryAliases, expandCountryAllForms } from "./countries";
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
import { expandCountryAliases, expandCountryAllForms } from "./countries";
import type { NoticeSearchParams, NoticeSearchResult } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEADLINE_SEC_EXPR = "n.deadline_sec";

// ── 采购类型映射缓存：避免每次 DISTINCT 查询冷启动 5s ──
async function getCachedNoticeTypes(pool: Pool): Promise<string[]> {
  if (_noticeTypeCache && _noticeTypeCache.expires > Date.now()) {
    return _noticeTypeCache.types;
  }
  const [rows] = await pool.query(
    "SELECT DISTINCT notice_type FROM crm_bid_notices WHERE (deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW())) AND notice_type IS NOT NULL"
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

  // ── 搜索状态变量（提前声明，供快速路径和主搜索路径共用）──
  let meiliHit = false;
  let total = 0;
  let pageIds: number[] = [];
  let countMs = 0;
  let idMs = 0;
  let searchMode = "mysql";
  let meiliForceCountryUsed = "";  // P0 修复：记录是否使用了国家级强制聚合

  // ── 参考号精确匹配快速路径 ──
  // 当搜索词非空且无其他复杂筛选条件时，先尝试宽表 reference 列精确匹配。
  // 走 B-tree 索引（< 1ms），命中则直接返回，跳过 Meilisearch/FULLTEXT，
  // 消除双路径分词差异和同步延迟导致的搜索结果不一致。
  let referenceHit = false;
  if (q && !p.codeId && !p.noticeType && !p.featuredOnly && !p.deadlineFrom && !p.deadlineTo && !p.deadlineWithinDays) {
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
      // 快速路径失败，静默降级到正常搜索流程
    }
  }

  // ── FORCE_COUNTRY 冲突检测 ──
  // 当机构为"XX各机构"（FORCE_COUNTRY 聚合）且用户同时选择了不同国家时，
  // 两个筛选条件互斥（不可能既是巴西机构又发生在法国），应直接返回空结果。
  // 修复前：Meilisearch 路径静默用 FORCE_COUNTRY 覆盖用户选择的国家（忽略国家筛选），
  //         MySQL 路径生成矛盾 WHERE 条件（行为不一致）。
  if (!referenceHit && country && agency) {
    const _checkItems = getAgencyCacheData() || [];
    const _checkCached = _checkItems.find((item) => item.agency === agency);
    if (_checkCached?.agencyGroup?.startsWith("FORCE_COUNTRY_")) {
      const forceCountry = _checkCached.agencyGroup.slice(14); // e.g. "Brazil"
      const countryUpperForms = expandCountryAllForms(country).map(f => f.toUpperCase());
      if (!countryUpperForms.includes(forceCountry.toUpperCase())) {
        // 冲突：用户选择的国家与 FORCE_COUNTRY 指定的国家不同
        console.log(`[search] FORCE_COUNTRY 矛盾: agency="${agency}" 要求 country="${forceCountry}"，` +
          `用户选择 country="${country}" → 返回空结果`);
        const emptyResult: NoticeSearchResult = {
          items: [], total: 0, page, pageSize,
        };
        noticeSearchCache.set(cacheKey, { payload: emptyResult, expires: Date.now() + NOTICE_SEARCH_CACHE_TTL });
        return emptyResult;
      }
    }
  }

  // ── Meilisearch 统一优先路径 ──
  // 所有搜索（包括中文关键词、UNSPSC、多条件组合）都首先尝试 Meilisearch
  // 只有 Meilisearch 不可用/超时/失败时才降级到 MySQL
  // 参考号精确匹配命中时跳过此阶段

  const isChinese = /[一-鿿]/.test(q);

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

  // ── 统一 Meilisearch 入口：所有搜索优先走 Meilisearch ──
  // 条件：Meilisearch 健康 + (无 codeId 或 Meilisearch 能处理该 UNSPSC level)
  // 当 codeId 存在但 Meilisearch 无法处理时（level 6/7 或 code 不存在），跳过 Meilisearch 走 MySQL
  const skipMeiliForUnspsc = p.codeId && !meiliCanHandleUnspsc;
  if (!referenceHit && isMeiliHealthy() && !skipMeiliForUnspsc) {
    // 解析机构名（供 Meilisearch 筛选）
    let meiliAgencies: string[] | undefined;
    let meiliAgencyGroup: string | undefined;
    let meiliForceCountry: string | undefined; // 国家级强制聚合（如"巴西各机构"）
    if (agency) {
      const _items = getAgencyCacheData() || [];
      const _cached = _items.find((item) => item.agency === agency);
      if (_cached?.agencyGroup?.startsWith("FORCE_COUNTRY_")) {
        // 国家级强制聚合：提取国家名作为 country 过滤条件
        meiliForceCountry = _cached.agencyGroup.slice(14); // "FORCE_COUNTRY_Brazil" → "Brazil"
        // P2-2 修复：检测 agency + country 冲突——与前置检查保持一致，返回空结果
        if (country && country !== meiliForceCountry) {
          console.log(`[search] FORCE_COUNTRY 冲突: agency="${agency}" 要求 country="${meiliForceCountry}"，用户选择 country="${country}" → 返回空结果`);
          const emptyResult: NoticeSearchResult = {
            items: [], total: 0, page, pageSize,
          };
          noticeSearchCache.set(cacheKey, { payload: emptyResult, expires: Date.now() + NOTICE_SEARCH_CACHE_TTL });
          return emptyResult;
        }
        meiliForceCountryUsed = meiliForceCountry;
      } else if (_cached?.agencyGroup && !_cached.agencyGroup.startsWith("ORPHAN_")) {
        // agencyGroup 仅对 Meilisearch 索引中实际存在的聚合组有效（如 MUNICIPIO_BR）
        // ORPHAN_ 兜底聚合是下拉列表动态生成的，Meilisearch 索引中不存在对应的 agency_group 值
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
      // 传入国家名所有已知形式（原始大小写 + 大写），让 Meilisearch 用 OR 匹配索引中的不同存储形式
      countryVariants: effectiveCountry ? expandCountryAllForms(effectiveCountry) : undefined,
      agencies: meiliAgencies,
      agencyGroup: meiliAgencyGroup,
      deadlineFrom: deadlineFrom || undefined,
      deadlineTo: deadlineTo || undefined,
      deadlineWithinDays: deadlineWithinDays || undefined,
      noticeType: noticeType || undefined,
      featuredOnly: featuredOnly || undefined,
      // UNSPSC：仅当 Meilisearch 能处理时传入（level 1-5）
      unspscLevel: meiliCanHandleUnspsc ? unspscLevel : undefined,
      unspscLevelId: meiliCanHandleUnspsc ? unspscLevelId : undefined,
      sort,
      page,
      pageSize,
    });

    if (meiliResult) {
      meiliHit = true;
      // Meilisearch 只用于获取 pageIds，total 始终来自数据库 COUNT 查询
      pageIds = meiliResult.ids;
      const meiliMs = Date.now() - meiliStart;

      // 搜索模式标记（便于日志分析）
      if (p.codeId) {
        searchMode = meiliCanHandleUnspsc
          ? (q ? (isChinese ? "meili-unspsc-zh" : "meili-unspsc-en") : "meili-unspsc")
          : "meili-no-unspsc"; // codeId 存在但 Meilisearch 无法处理 UNSPSC level
      } else {
        searchMode = q ? (isChinese ? "meili-zh" : "meili-en") : "meili-filter";
      }

      console.log(`[search-perf] mode=${searchMode} page=${p.page} q="${q}" country="${country}" agency="${agency}"` +
        (meiliAgencyGroup ? ` agencyGroup="${meiliAgencyGroup}"` : "") +
        (p.codeId ? ` codeId=${p.codeId}` : "") +
        ` | Meilisearch=${meiliMs}ms | total=${total} | ids=${pageIds.length}`);
    } else {
      // Meilisearch 返回 null（超时或内部错误）→ 降级到 MySQL
      console.warn(`[search-perf] Meilisearch 返回 null，降级到 MySQL | q="${q}" country="${country}" codeId=${p.codeId || "-"}`);
    }
  }

  // ── MySQL 降级路径（仅当 Meilisearch 不可用/失败时执行）──
  if (!meiliHit && !referenceHit) {
    searchMode = q ? (isChinese ? "mysql-zh-FULLTEXT" : "mysql-en-FULLTEXT") : "mysql-none";
    console.log(`[search-perf] fallback MySQL mode=${searchMode} q="${q}" country="${country}"`);
  }

  // 修复：只用 deadline_sec 实时判断，不再依赖 is_active 缓存
  // deadline_sec = 0 表示无截止日期（永不过期），deadline_sec >= NOW() 表示未过期
  const where: string[] = [
    "(n.deadline_ts IS NULL OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))"
  ];
  const params: any[] = [];
  let join = "";
  let idFilterSql = "";
  const idFilterParams: any[] = [];

  // UNSPSC：始终构建 SQL 过滤条件
  // - 当 Meilisearch 命中时：用于 COUNT 校准，确保总数准确
  // - 当 Meilisearch 未命中时：用于 MySQL 降级路径的 ID 过滤
  if (p.codeId) {
    const filter = await buildNoticeUnspscFilter(pool, p.codeId);
    idFilterSql = filter.sql;
    idFilterParams.push(...filter.params);
  }

  const compactQ = q.replace(/\s+/g, "").toUpperCase();
  const likeQ = `%${q}%`;
  let kwUnionSql = "";
  const kwUnionParams: any[] = [];

  if (q) {
    if (isChinese) {
      kwUnionSql =
        "SELECT n2.id FROM crm_bid_notices n2 WHERE (n2.deadline_ts IS NULL OR n2.deadline_sec >= UNIX_TIMESTAMP(NOW())) AND MATCH(n2.title, n2.reference, n2.description) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT qzh.notice_id FROM crm_notice_translations qzh WHERE qzh.lang = 'zh' AND (qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?)";
      kwUnionParams.push(q, likeQ, likeQ);
    } else {
      kwUnionSql =
        "SELECT n2.id FROM crm_bid_notices n2 WHERE (n2.deadline_ts IS NULL OR n2.deadline_sec >= UNIX_TIMESTAMP(NOW())) AND MATCH(n2.title, n2.reference) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT sn.id FROM crm_bid_notices sn WHERE (sn.deadline_ts IS NULL OR sn.deadline_sec >= UNIX_TIMESTAMP(NOW())) AND MATCH(sn.description) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT qen.notice_id FROM crm_notice_translations qen WHERE qen.lang = 'en' AND MATCH(qen.title_tr, qen.description_tr) AGAINST(? IN BOOLEAN MODE)";
      kwUnionParams.push(q, q, q);
    }
  }
  if (country) {
    // 修复：展开国家别名 + UPPER() 大小写不敏感匹配，覆盖数据库中所有变体
    // 如 "Philippines" / "The Philippines" / "PHL" 等都能被匹配到
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
      // 国家级强制聚合：使用 country 过滤（如"巴西各机构" → country = 'Brazil'）
      const forceCountry = cachedItem.agencyGroup.slice(14);
      meiliForceCountryUsed = forceCountry; // 记录强制聚合（供日志和缓存判断）
      // P0 修复：检测 agency + country 冲突
      if (country && country !== forceCountry) {
        console.log(`[search] FORCE_COUNTRY 冲突(MySQL): agency="${agency}" 覆盖 country="${country}" → "${forceCountry}"`);
      }
      // 修复：展开国家别名，UPPER() 大小写不敏感匹配数据库中的变体名称
      const forceCountryVariants = expandCountryAliases(forceCountry);
      if (forceCountryVariants.length > 1) {
        where.push(`UPPER(n.country) IN (${forceCountryVariants.map(() => "?").join(",")})`);
        params.push(...forceCountryVariants);
      } else {
        where.push("UPPER(n.country) = ?");
        params.push(forceCountry.toUpperCase());
      }
    } else if (cachedItem?.sqlPattern) {
      // PERF 优化：大型聚合组使用 SQL LIKE 模式匹配，替代数千个 OR 条件
      // 例如 MUNICIPIO_BR → "MUNICIPIO %" 匹配所有巴西市政府
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
    // 修复：统一使用北京时间（UTC+8）解析，与 Meilisearch 路径保持一致
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
    // P2 修复：统一使用应用服务器时间（与 Meilisearch 路径一致），避免 MySQL NOW() 时钟偏差
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

  // 移除 MySQL COUNT 校准（太慢，17-20秒）
  // 直接使用 Meilisearch 返回的 total，或者使用统计表
  let meiliCalibratePromise: Promise<number | null> | null = null;

  if (!meiliHit && !referenceHit) {
    // P2 修复：MySQL 降级路径增加超时保护（15 秒），避免极端慢查询无限阻塞
    const MYSQL_TIMEOUT_MS = 15000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`MySQL search timeout after ${MYSQL_TIMEOUT_MS}ms`)), MYSQL_TIMEOUT_MS)
    );

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

    try {
      const [countResult, idResult] = await Promise.race([
        Promise.all([countTimed, idTimed]),
        timeoutPromise,
      ]) as [any, any];
      t1 = Date.now();
      const [countRows] = countResult;
      const [idRows] = idResult;
      total = Number((countRows as RowDataPacket[])[0]?.total || 0);
      pageIds = (idRows as RowDataPacket[]).map((row) => Number(row.id)).filter(Boolean);
    } catch (timeoutErr) {
      console.warn(`[search-perf] MySQL 超时(${MYSQL_TIMEOUT_MS}ms)，返回空结果: q="${q}" country="${country}" agency="${agency}"`);
      total = 0;
      pageIds = [];
      t1 = Date.now();
    }
  }

  // ── Meilisearch 空命中校准 ──
  // Meilisearch 未返回任何本页 ID，但 MySQL COUNT 表明存在命中（索引口径分歧：
  // 宽表 unspsc_levelN 尚未同步、文档 deadline_sec 陈旧、增量同步水位未覆盖等）。
  // 此时降级用 MySQL ID 查询取本页 ID，保证列表与 total 一致。
  // 典型症状：total=N 但列表为空（头部显示"共 N 条"却无卡片展示），
  // 在深层类目（level4/5）小口径筛选下尤为明显。
  if (meiliHit && pageIds.length === 0 && !referenceHit) {
    try {
      const CALIBRATE_TIMEOUT_MS = p.codeId ? 15000 : 5000;
      const calibrateCount = await Promise.race([
        countPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), CALIBRATE_TIMEOUT_MS)),
      ]) as any;
      const calibrateTotal = calibrateCount ? Number((calibrateCount[0] as any[])[0]?.total || 0) : 0;
      // 仅当请求页在总数范围内时才降级取 ID（超出范围的页合法地返回空）
      if (calibrateTotal > offset) {
        let fallbackQuery: string;
        let fallbackParams: any[];
        if (q) {
          fallbackQuery = `SELECT n.id FROM crm_bid_notices n ${countJoin} WHERE ${whereSql} AND n.id IN (SELECT id FROM (${kwUnionSql}) AS _u) ORDER BY ${orderSql} LIMIT ? OFFSET ?`;
          fallbackParams = [...idFilterParams, ...params, ...kwUnionParams, ...orderParams, pageSize, offset];
        } else {
          fallbackQuery = `SELECT n.id FROM crm_bid_notices n ${countJoin} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`;
          fallbackParams = [...idFilterParams, ...params, ...orderParams, pageSize, offset];
        }
        const [fallbackRows] = await pool.query(fallbackQuery, fallbackParams);
        const fallbackIds = (fallbackRows as RowDataPacket[]).map((row) => Number(row.id)).filter(Boolean);
        if (fallbackIds.length > 0) {
          pageIds = fallbackIds;
          searchMode = `${searchMode}-id-fallback`;
          console.log(`[search-perf] Meilisearch 空命中校准: COUNT=${calibrateTotal} → MySQL 取 ${fallbackIds.length} 条 ID (codeId=${p.codeId || "-"})`);
        }
      }
    } catch (err) {
      console.warn(`[search-perf] Meilisearch 空命中校准失败（保持空列表）: ${(err as Error).message}`);
    }
  }

  // 阶段 2：按 ID 批量获取详情
  // 宽表就绪时直接从宽表读取（零 JOIN），否则回退到原始多表 JOIN
  let detailRows: RowDataPacket[] = [];
  const useWideTable = await isWideTableReady(pool);
  if (pageIds.length > 0) {
    if (useWideTable) {
      // ── 宽表路径：单表查询，零 JOIN ──
      // i18n：根据 locale 动态选择对应语言的翻译字段
      // 支持的语言：zh, en, fr, ru, es, ar
      //
      // PERF: description_* 列已改为 VARCHAR(2000)，数据存储在行内，
      // 无 InnoDB 溢出页开销，零 JOIN 单表查询性能最优。
      const SUPPORTED_LANGS = ["zh", "en", "fr", "ru", "es", "ar"];
      const lang = locale && SUPPORTED_LANGS.includes(locale) ? locale : "en";
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
      detailRows = dRows as RowDataPacket[];
    } else {
      // ── 回退路径：原始多表 JOIN（向后兼容）──
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
  }

  const t2 = Date.now();

  // ── 始终使用数据库 COUNT 查询的精确值 ──
  // Meilisearch 的 estimatedTotalHits 是估算值，可能导致数字波动
  // 因此 total 始终来自数据库 COUNT 查询（通过 countPromise）
  if (!referenceHit) {
    const COUNT_TIMEOUT_MS = p.codeId ? 15000 : 5000;  // UNSPSC 查询可能较慢，给更长时间
    try {
      const countResult = await Promise.race([
        countPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), COUNT_TIMEOUT_MS)),
      ]) as any;
      if (countResult) {
        total = Number((countResult[0] as any[])[0]?.total || 0);
        countMs = Date.now() - t2;
      } else {
        // COUNT 查询超时，记录警告并使用 0
        console.warn(`[search-perf] COUNT 查询超时(${COUNT_TIMEOUT_MS}ms): codeId=${p.codeId || '-'}`);
        total = 0;
      }
    } catch {
      // COUNT 查询失败，使用 0
      total = 0;
    }
  }

  // P1 修复：最后一页短路——对 Meilisearch 和 MySQL 两条路径都生效
  const lastPageShortCircuit = pageIds.length > 0 && pageIds.length < pageSize;
  if (lastPageShortCircuit) {
    total = offset + pageIds.length;
    countMs = 0;
    console.log(`[search-perf] COUNT 短路: page=${page} items=${pageIds.length} < pageSize=${pageSize} → total=${total} (0ms)`);
  }

  // 首页写入 COUNT 缓存
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
        // 宽表路径直接返回 breakdown_file_count；回退路径需运行时计算
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

  // 构建缓存和响应 payload
  // 修复：保留翻译字段（title_i18n/description_i18n），避免缓存命中时丢失译文
  // 缓存 key 已包含 locale，不同语言的缓存完全隔离，不存在跨语言污染风险
  const cachePayload: NoticeSearchResult = {
    items: rawRows.map((row) => ({
      ...row,
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
