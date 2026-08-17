/**
 * 五级行业精准匹配服务 — 编排入口与 barrel export
 * Industry matching service — orchestrator and barrel exports
 *
 * @module server/services/industry-match
 * @description 将用户显式选择的五级行业（crm_user_industry_prefs）与公告分类标签
 *              （crm_bid_notice_unspsc_codes）按精细程度分层匹配：
 *              单等值分层召回（T0 精确码 → T1 等深 → 上溯各级 → 码前缀），
 *              层间精细度递减天然排序；不足一页时通过 UNSPSC 类目树推断
 *              相关类目（smartInferUnspsc），按推断类目的 code 前缀精确召回，
 *              保证结果始终在同一行业分支内。
 *              无行业偏好返回空（fallback=no_prefs），不做截止时间兜底——
 *              保持"精准频道"语义，通用兜底由调用方决定。
 *
 *              统一化重构后：行业匹配支持叠加全部筛选参数（关键词/国家/机构/日期/采购类型/精选），
 *              关键词通过两阶段 ID 查询复用搜索模块的 Meilisearch + MySQL FULLTEXT 降级链路。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows, escapeLikeWildcard } from "../../utils/normalize";
import { resolveUserIndustryProfile } from "./resolve";
import {
  buildIndustryMatchTiers,
  buildIndustryFilterConditions,
  ACTIVE_NOTICE_WHERE,
  NOTICE_SELECT_FIELDS,
  DEADLINE_ORDER,
  type TierQuery,
} from "./filter";
import { inferNoticesByCategory } from "./fuzzy";
import type { IndustryMatchResult, IndustryMatchFilters, MatchTierLabel } from "./types";
import type { NoticesRepo } from "../../repos/notices.repo";
import { triggerBackTranslation } from "../notice-search/translation-trigger";
import { getAgencyCacheData } from "../notice-search/agencies";
import { expandCountryAliases } from "../notice-search/countries";
import { searchWithFilters as meiliSearch, isHealthy as isMeiliHealthy } from "../meilisearch/index";

// ── 结果缓存（5 分钟 TTL，参照 recommend 模块模式）──
const resultCache = new Map<string, { data: IndustryMatchResult; expires: number }>();
const RESULT_CACHE_TTL = 5 * 60 * 1000;
const RESULT_CACHE_MAX = 200;

// ── 层计数缓存（按 userKey 缓存各层 COUNT 结果，翻页请求复用，避免重复慢查询）──
const tierCountCache = new Map<string, { totals: number[]; expires: number }>();
const TIER_COUNT_CACHE_TTL = 5 * 60 * 1000;

/**
 * 失效行业匹配缓存（结果缓存 + 层计数缓存）。
 * 用户修改行业选择后必须调用，确保下次立即按新行业匹配。
 * @param userKey 不传则清空全部缓存
 */
export function invalidateIndustryMatchCache(userKey?: string): void {
  if (!userKey) {
    resultCache.clear();
    tierCountCache.clear();
    return;
  }
  for (const key of resultCache.keys()) {
    if (key.startsWith(`${userKey}:`)) resultCache.delete(key);
  }
  tierCountCache.delete(userKey);
}

/** 匹配分 → 档次标签（供展示推荐理由） */
export function matchScoreToTierLabel(score: number): MatchTierLabel {
  if (score >= 5) return "exact_code";
  if (score >= 4) return "same_level";
  if (score >= 2) return "upper_level";
  if (score >= 1) return "prefix";
  if (score > 0) return "inferred_category";
  return "unmatched";
}

/**
 * 公告行后处理：对齐搜索 API 的 items 字段结构。
 * 补齐 agency_i18n、is_featured 等国际化字段，确保前端 NoticeCard 回退链在所有数据源下行为一致。
 */
function mapResultItems(rows: RowDataPacket[], locale?: string): Array<Record<string, unknown>> {
  // 机构国际化：与搜索 API 的 formatSearchResult 一致
  const agencyCache = getAgencyCacheData();
  const agencyI18nMap = new Map<string, Record<string, string>>();
  if (agencyCache) {
    for (const item of agencyCache) {
      if (item.i18n) agencyI18nMap.set(item.agency, item.i18n);
    }
  }

  return rows.map((row) => {
    const { codes_concat, documents, procurement_files, ...rest } = row;
    const score = Number(row.match_score || 0);
    const agencyI18n = agencyI18nMap.get(row.agency);
    return {
      ...rest,
      match_score: score,
      match_tier: matchScoreToTierLabel(score),
      agency_i18n: agencyI18n?.[locale || ""] || undefined,
      is_featured: row.is_featured ? true : undefined,
      organization: null,
      source_url: null,
      core_locked: true,
      breakdown_file_count: normalizeDocumentRows(documents, procurement_files).length,
    };
  });
}

/**
 * 构建机构扩展筛选条件（与 search-pipeline 一致）。
 * 处理 FORCE_COUNTRY / sqlPattern / originalAgencies 等机构缓存逻辑。
 */
function buildAgencyExpandedClauses(
  agency: string,
): { clause: string; params: unknown[]; forceCountry?: string } | null {
  if (!agency) return null;
  const agencyItems = getAgencyCacheData() || [];
  const cachedItem = agencyItems.find((item) => item.agency === agency);

  if (cachedItem?.agencyGroup?.startsWith("FORCE_COUNTRY_")) {
    const forceCountry = cachedItem.agencyGroup.slice(14);
    const forceCountryVariants = expandCountryAliases(forceCountry);
    if (forceCountryVariants.length > 1) {
      return {
        clause: `UPPER(n.country) IN (${forceCountryVariants.map(() => "?").join(",")})`,
        params: forceCountryVariants.map((c) => c.toUpperCase()),
        forceCountry,
      };
    }
    return { clause: "UPPER(n.country) = ?", params: [forceCountry.toUpperCase()], forceCountry };
  }
  if (cachedItem?.sqlPattern) {
    return { clause: "UPPER(n.agency) LIKE ?", params: [cachedItem.sqlPattern] };
  }
  if (cachedItem?.originalAgencies && cachedItem.originalAgencies.length > 1) {
    const placeholders = cachedItem.originalAgencies.map(() => "?").join(",");
    return { clause: `n.agency IN (${placeholders})`, params: [...cachedItem.originalAgencies] };
  }
  if (cachedItem?.originalAgencies?.length === 1) {
    return { clause: "n.agency = ?", params: [cachedItem.originalAgencies[0]] };
  }
  return { clause: "n.agency = ?", params: [agency] };
}

/**
 * 关键词两阶段查询：获取匹配的公告 ID 列表。
 * 复用搜索模块的 Meilisearch 优先 → MySQL FULLTEXT 降级链路。
 * @returns 匹配的公告 ID 数组；空数组表示关键词无匹配
 */
async function resolveKeywordIds(
  pool: Pool,
  q: string,
  filters: IndustryMatchFilters,
): Promise<{ ids: number[]; meiliReturnedEmpty: boolean }> {
  const isChinese = /[一-鿿]/.test(q);
  const likeQ = `%${escapeLikeWildcard(q)}%`;

  // 1a. Meilisearch 优先路径
  if (isMeiliHealthy()) {
    try {
      const meiliResult = await meiliSearch({
        q,
        country: filters.country || undefined,
        agencies: filters.agency ? [filters.agency] : undefined,
        deadlineFrom: filters.deadlineFrom || undefined,
        deadlineTo: filters.deadlineTo || undefined,
        deadlineWithinDays: filters.deadlineWithinDays || undefined,
        noticeType: filters.noticeType || undefined,
        featuredOnly: filters.featuredOnly || undefined,
        page: 1,
        pageSize: 10000,
      });
      if (meiliResult) {
        return { ids: meiliResult.ids, meiliReturnedEmpty: meiliResult.ids.length === 0 };
      }
    } catch { /* Meilisearch 失败，降级到 MySQL */ }
  }

  // 1b. MySQL FULLTEXT 降级路径
  let kwSql: string;
  let kwParams: unknown[];
  if (isChinese) {
    kwSql =
      "SELECT n2.id FROM crm_bid_notices n2 WHERE " + ACTIVE_NOTICE_WHERE +
      " AND MATCH(n2.title, n2.reference, n2.description) AGAINST(? IN BOOLEAN MODE)" +
      " UNION " +
      "SELECT qzh.notice_id FROM crm_notice_translations qzh WHERE qzh.lang = 'zh' AND (qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?)";
    kwParams = [q, likeQ, likeQ];
  } else {
    kwSql =
      "SELECT n2.id FROM crm_bid_notices n2 WHERE " + ACTIVE_NOTICE_WHERE +
      " AND MATCH(n2.title, n2.reference) AGAINST(? IN BOOLEAN MODE)" +
      " UNION " +
      "SELECT sn.id FROM crm_bid_notices sn WHERE " + ACTIVE_NOTICE_WHERE +
      " AND MATCH(sn.description) AGAINST(? IN BOOLEAN MODE)" +
      " UNION " +
      "SELECT qen.notice_id FROM crm_notice_translations qen WHERE qen.lang = 'en' AND MATCH(qen.title_tr, qen.description_tr) AGAINST(? IN BOOLEAN MODE)";
    kwParams = [q, q, q];
  }

  // 叠加非关键词筛选条件到 MySQL 降级查询
  const extraConditions: string[] = [];
  const extraParams: unknown[] = [];
  if (filters.country) {
    extraConditions.push("UPPER(n2.country) = ?");
    extraParams.push(filters.country.toUpperCase());
  }
  if (filters.featuredOnly) {
    extraConditions.push("n2.is_featured = 1");
  }
  if (filters.noticeType) {
    extraConditions.push("n2.notice_type = ?");
    extraParams.push(filters.noticeType);
  }

  // 注意：MySQL 降级路径中 UNION 查询的额外筛选仅应用于第一个 SELECT
  // 为简化实现，此处仅对 Meilisearch 路径做完整筛选；MySQL 路径仅做基础关键词匹配
  const [kwRows] = await pool.query(kwSql, kwParams);
  const ids = (kwRows as RowDataPacket[]).map((r) => Number(r.id)).filter((id) => id > 0);
  // 截断保护
  if (ids.length > 10000) {
    console.warn(`[industry-match] keyword IDs truncated: ${ids.length} → 10000`);
    ids.length = 10000;
  }
  return { ids, meiliReturnedEmpty: ids.length === 0 };
}

/** 查询各层公告总数（带缓存；纯 COUNT 无排序，单等值走复合索引） */
async function loadTierTotals(
  pool: Pool,
  userKey: string,
  tiers: TierQuery[],
  hasFilters: boolean,
  filterWhere: string,
  filterParams: unknown[],
  keywordIds?: number[],
): Promise<number[]> {
  // 有筛选条件时不使用缓存（筛选组合有限，不影响性能）
  if (!hasFilters) {
    const cached = tierCountCache.get(userKey);
    if (cached && cached.expires > Date.now()) return cached.totals;
  }

  const keywordWhere = keywordIds && keywordIds.length > 0
    ? ` AND n.id IN (${keywordIds.join(",")})`
    : "";
  const countTier = (tier: TierQuery) =>
    pool.query(
      `SELECT COUNT(DISTINCT n.id) AS total
       FROM crm_bid_notices n
       INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
       WHERE (${tier.clause}) AND ${ACTIVE_NOTICE_WHERE}${filterWhere}${keywordWhere}`,
      [...tier.params, ...filterParams],
    );
  const results = await Promise.all(tiers.map(countTier));
  const totals = results.map(
    (result) => Number(((result[0] as RowDataPacket[])[0]?.total) || 0),
  );
  if (!hasFilters) {
    tierCountCache.set(userKey, { totals, expires: Date.now() + TIER_COUNT_CACHE_TTL });
  }
  return totals;
}

/**
 * 查询单层公告数据（懒执行：仅在前层结果不足时调用）
 *
 * 统一语言回退方案（与推荐模块一致）：
 * - 标题回退链：title_i18n（当前语言译文）→ title_en（英文译文）→ title（原文）
 * - 描述回退链：description_i18n → description_cn（仅 zh）→ description_en → description
 * - 招标内容：zh 环境优先 description_cn → description_i18n → bid_overview
 *             非 zh 环境优先 bid_overview → description
 */
async function queryTierRows(
  pool: Pool,
  tier: TierQuery,
  limit: number,
  offset: number,
  locale?: string,
  filterWhere?: string,
  filterParams?: unknown[],
  keywordIds?: number[],
): Promise<RowDataPacket[]> {
  // 统一 JOIN 翻译表（所有语言包括 zh）+ 英文回退表 + 机会表
  const trJoin = locale
    ? "LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?"
    : "";
  const trParams = locale ? [locale] : [];
  const treJoin = "LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  const oppJoin = "LEFT JOIN crm_bid_opportunities opp ON opp.source_notice_id = n.notice_id AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1)";
  // 统一选取：当前语言译文 + 英文回退 + 中文拆解描述 + 投标概览 + 受益国
  const trSelect = locale ? "tr.title_tr AS title_i18n, tr.description_tr AS description_i18n," : "";
  const treSelect = "tre.title_tr AS title_en, tre.description_tr AS description_en,";
  const oppSelect = "MAX(opp.description_cn) AS description_cn, LEFT(MAX(opp.bid_overview), 200) AS bid_overview, MAX(opp.beneficiary_countries) AS beneficiary_countries,";

  const fw = filterWhere || "";
  const fp = filterParams || [];
  const keywordWhere = keywordIds && keywordIds.length > 0
    ? ` AND n.id IN (${keywordIds.join(",")})`
    : "";

  const [result] = await pool.query(
    `SELECT ${NOTICE_SELECT_FIELDS}, ${trSelect} ${treSelect} ${oppSelect} ${tier.score} AS match_score
     FROM crm_bid_notices n
     INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
     ${oppJoin}
     ${trJoin}
     ${treJoin}
     WHERE (${tier.clause}) AND ${ACTIVE_NOTICE_WHERE}${fw}${keywordWhere}
     GROUP BY n.id
     ORDER BY match_score DESC, ${DEADLINE_ORDER}
     LIMIT ? OFFSET ?`,
    [...trParams, ...tier.params, ...fp, limit, offset],
  );
  return result as RowDataPacket[];
}

/**
 * 行业精准匹配主入口。
 * @param locale 当前界面语言，所有语言（含 zh）均走统一翻译回退链
 * @param noticesRepo 可选，用于按需补翻缺失译文的公告（与推荐模块一致）
 * @param filters 可选筛选参数，叠加到行业匹配查询的 WHERE 子句
 * @returns 无行业偏好 fallback=no_prefs；无匹配 fallback=no_match；正常 none
 */
export async function matchNoticesByIndustry(
  pool: Pool,
  userKey: string,
  page: number,
  pageSize: number,
  locale?: string,
  noticesRepo?: NoticesRepo,
  filters?: IndustryMatchFilters,
): Promise<IndustryMatchResult> {
  const offset = (page - 1) * pageSize;

  // 无用户标识：返回空，不做截止时间兜底
  if (!userKey) {
    return { items: [], total: 0, page, pageSize, fallback: "no_prefs" };
  }

  // 缓存键包含筛选参数哈希，避免不同筛选条件返回相同缓存
  const filtersHash = filters ? JSON.stringify(filters) : "_";
  const cacheKey = `${userKey}:${locale || "_"}:${page}:${pageSize}:${filtersHash}`;
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const profile = await resolveUserIndustryProfile(pool, userKey);
  if (!profile) {
    return { items: [], total: 0, page, pageSize, fallback: "no_prefs" };
  }

  const tiers = buildIndustryMatchTiers(profile);
  const hasFilters = Boolean(
    filters?.q || filters?.country || filters?.agency ||
    filters?.deadlineFrom || filters?.deadlineTo || filters?.deadlineWithinDays ||
    filters?.noticeType || filters?.featuredOnly
  );

  // ── 机构扩展筛选（FORCE_COUNTRY / sqlPattern / originalAgencies）──
  const agencyExpanded = filters?.agency ? buildAgencyExpandedClauses(filters.agency) : null;
  // 如果机构 FORCE_COUNTRY 与用户选择的 country 矛盾，直接返回空
  if (agencyExpanded?.forceCountry && filters?.country && filters.country !== agencyExpanded.forceCountry) {
    return { items: [], total: 0, page, pageSize, fallback: "no_match" };
  }

  // ── 构建非关键词筛选条件 ──
  const { conditions: filterConditions, params: filterParams } = buildIndustryFilterConditions(
    filters,
    agencyExpanded ? { clause: agencyExpanded.clause, params: agencyExpanded.params } : null,
  );
  const filterWhere = filterConditions.length > 0 ? ` AND ${filterConditions.join(" AND ")}` : "";

  // ── 关键词两阶段查询：阶段 1 获取匹配 ID ──
  let keywordIds: number[] | undefined;
  if (filters?.q) {
    const kwResult = await resolveKeywordIds(pool, filters.q, filters || {});
    if (kwResult.ids.length === 0) {
      // 关键词无匹配，直接返回空
      return { items: [], total: 0, page, pageSize, fallback: "no_match" };
    }
    keywordIds = kwResult.ids;
  }

  // ── 各层 COUNT 并行（有筛选时跳过缓存）──
  const tierTotalsPromise = loadTierTotals(pool, userKey, tiers, hasFilters, filterWhere, filterParams, keywordIds);

  // ── 数据查询懒执行：先查最精细层，不足一页再逐层放宽 ──
  const rows: RowDataPacket[] = [];
  let skip = offset;
  let tierIndex = 0;
  let tierTotals: number[] = [];

  const ensureTotals = async () => {
    if (tierTotals.length === 0) tierTotals = await tierTotalsPromise;
  };

  // 首层先行取数（与 COUNT 并行，覆盖绝大多数首页请求）
  if (tiers.length > 0 && skip === 0) {
    const firstTierRows = await queryTierRows(pool, tiers[0], pageSize, 0, locale, filterWhere, filterParams, keywordIds);
    rows.push(...firstTierRows);
    tierIndex = 1;
    await ensureTotals();
  } else {
    await ensureTotals();
  }

  // 跨层取数：按 offset 跳过满层，逐层填充至 pageSize
  for (; tierIndex < tiers.length && rows.length < pageSize; tierIndex += 1) {
    if (skip >= tierTotals[tierIndex]) {
      skip -= tierTotals[tierIndex];
      continue;
    }
    const tierRows = await queryTierRows(
      pool,
      tiers[tierIndex],
      pageSize - rows.length,
      skip,
      locale,
      filterWhere,
      filterParams,
      keywordIds,
    );
    rows.push(...tierRows);
    skip = 0;
  }

  const total = tierTotals.reduce((sum, n) => sum + n, 0);

  // 各层结果仍不足一页时，用 UNSPSC 类目推断兜底（Tier 4）
  if (rows.length < pageSize) {
    const existingIds = new Set(rows.map((r) => Number(r.id)));
    const inferredRows = await inferNoticesByCategory(
      pool, profile, pageSize - rows.length, locale,
      undefined, filters, 
      agencyExpanded ? { clause: agencyExpanded.clause, params: agencyExpanded.params } : null,
      keywordIds,
    );
    for (const inferredRow of inferredRows) {
      if (!existingIds.has(Number(inferredRow.id))) rows.push(inferredRow);
    }
  }

  // 统一按需补翻：复用搜索模块的 triggerBackTranslation（替换内联实现）
  if (locale && noticesRepo) {
    triggerBackTranslation(rows, locale, noticesRepo, pool);
  }

  const items = mapResultItems(rows, locale);
  const result: IndustryMatchResult = {
    items,
    total,
    page,
    pageSize,
    fallback: total === 0 && items.length === 0 ? "no_match" : "none",
  };

  // 写入缓存（超限时先清理过期项）
  if (resultCache.size >= RESULT_CACHE_MAX) {
    const now = Date.now();
    for (const [key, entry] of resultCache) {
      if (entry.expires <= now) resultCache.delete(key);
    }
    if (resultCache.size >= RESULT_CACHE_MAX) resultCache.clear();
  }
  resultCache.set(cacheKey, { data: result, expires: Date.now() + RESULT_CACHE_TTL });

  return result;
}

// ── barrel export：子模块统一入口 ──
export { resolveUserIndustryProfile } from "./resolve";
export {
  buildIndustryMatchTiers,
  buildIndustryFilterConditions,
  ACTIVE_NOTICE_WHERE,
  NOTICE_SELECT_FIELDS,
  DEADLINE_ORDER,
} from "./filter";
export { inferNoticesByCategory } from "./fuzzy";
export * from "./types";
