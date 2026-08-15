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
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import { resolveUserIndustryProfile } from "./resolve";
import {
  buildIndustryMatchTiers,
  ACTIVE_NOTICE_WHERE,
  NOTICE_SELECT_FIELDS,
  DEADLINE_ORDER,
  type TierQuery,
} from "./filter";
import { inferNoticesByCategory } from "./fuzzy";
import type { IndustryMatchResult, MatchTierLabel } from "./types";
import type { NoticesRepo } from "../../repos/notices.repo";
import { getTranslatedNoticeDetail } from "../translation/notice";

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

/** 公告行后处理：对齐推荐模块的 items 字段结构（阶段 4 融合复用） */
function mapResultItems(rows: RowDataPacket[]): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const { codes_concat, documents, procurement_files, ...rest } = row;
    const score = Number(row.match_score || 0);
    return {
      ...rest,
      match_score: score,
      match_tier: matchScoreToTierLabel(score),
      organization: null,
      source_url: null,
      core_locked: true,
      breakdown_file_count: normalizeDocumentRows(documents, procurement_files).length,
    };
  });
}

/** 查询各层公告总数（带缓存；纯 COUNT 无排序，单等值走复合索引） */
async function loadTierTotals(pool: Pool, userKey: string, tiers: TierQuery[]): Promise<number[]> {
  const cached = tierCountCache.get(userKey);
  if (cached && cached.expires > Date.now()) return cached.totals;

  const countTier = (tier: TierQuery) =>
    pool.query(
      `SELECT COUNT(DISTINCT n.id) AS total
       FROM crm_bid_notices n
       INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
       WHERE (${tier.clause}) AND ${ACTIVE_NOTICE_WHERE}`,
      tier.params,
    );
  const results = await Promise.all(tiers.map(countTier));
  const totals = results.map(
    (result) => Number(((result[0] as RowDataPacket[])[0]?.total) || 0),
  );
  tierCountCache.set(userKey, { totals, expires: Date.now() + TIER_COUNT_CACHE_TTL });
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
): Promise<RowDataPacket[]> {
  // 统一 JOIN 翻译表（所有语言包括 zh）+ 英文回退表 + 机会表
  const trJoin = locale
    ? "LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?"
    : "";
  const trParams = locale ? [locale] : [];
  const treJoin = "LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  const oppJoin = "LEFT JOIN crm_bid_opportunities opp ON opp.source_notice_id = n.notice_id AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1)";
  // 统一选取：当前语言译文 + 英文回退 + 中文拆解描述 + 投标概览
  const trSelect = locale ? "tr.title_tr AS title_i18n, tr.description_tr AS description_i18n," : "";
  const treSelect = "tre.title_tr AS title_en, tre.description_tr AS description_en,";
  const oppSelect = "MAX(opp.description_cn) AS description_cn, LEFT(MAX(opp.bid_overview), 200) AS bid_overview,";
  const [result] = await pool.query(
    `SELECT ${NOTICE_SELECT_FIELDS}, ${trSelect} ${treSelect} ${oppSelect} ${tier.score} AS match_score
     FROM crm_bid_notices n
     INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
     ${oppJoin}
     ${trJoin}
     ${treJoin}
     WHERE (${tier.clause}) AND ${ACTIVE_NOTICE_WHERE}
     GROUP BY n.id
     ORDER BY match_score DESC, ${DEADLINE_ORDER}
     LIMIT ? OFFSET ?`,
    [...trParams, ...tier.params, limit, offset],
  );
  return result as RowDataPacket[];
}

/**
 * 行业精准匹配主入口。
 * @param locale 当前界面语言，所有语言（含 zh）均走统一翻译回退链
 * @param noticesRepo 可选，用于按需补翻缺失译文的公告（与推荐模块一致）
 * @returns 无行业偏好 fallback=no_prefs；无匹配 fallback=no_match；正常 none
 */
export async function matchNoticesByIndustry(
  pool: Pool,
  userKey: string,
  page: number,
  pageSize: number,
  locale?: string,
  noticesRepo?: NoticesRepo,
): Promise<IndustryMatchResult> {
  const offset = (page - 1) * pageSize;

  // 无用户标识：返回空，不做截止时间兜底
  if (!userKey) {
    return { items: [], total: 0, page, pageSize, fallback: "no_prefs" };
  }

  // 缓存命中（locale 纳入缓存键，不同语言结果独立缓存）
  const cacheKey = `${userKey}:${locale || "_"}:${page}:${pageSize}`;
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const profile = await resolveUserIndustryProfile(pool, userKey);
  if (!profile) {
    return { items: [], total: 0, page, pageSize, fallback: "no_prefs" };
  }

  const tiers = buildIndustryMatchTiers(profile);

  // ── 各层 COUNT 并行（带缓存；宽泛层如 L1 等值命中数万标签行，是本查询的主要耗时）──
  const tierTotalsPromise = loadTierTotals(pool, userKey, tiers);

  // ── 数据查询懒执行：先查最精细层，不足一页再逐层放宽 ──
  // 第一页（offset 在前几层合计内）无需等待 COUNT 完成即可先行取数
  const rows: RowDataPacket[] = [];
  let skip = offset;
  let tierIndex = 0;
  let tierTotals: number[] = [];

  const ensureTotals = async () => {
    if (tierTotals.length === 0) tierTotals = await tierTotalsPromise;
  };

  // 首层先行取数（与 COUNT 并行，覆盖绝大多数首页请求）
  if (tiers.length > 0 && skip === 0) {
    const firstTierRows = await queryTierRows(pool, tiers[0], pageSize, 0, locale);
    rows.push(...firstTierRows);
    tierIndex = 1;
    await ensureTotals();
    // 首层结果不足时继续后续层
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
    );
    rows.push(...tierRows);
    skip = 0;
  }

  const total = tierTotals.reduce((sum, n) => sum + n, 0);

  // 各层结果仍不足一页时，用 UNSPSC 类目推断兜底（Tier 4）
  // 通过 smartInferUnspsc 在类目树中推断相关类目，按 code 前缀精确召回
  if (rows.length < pageSize) {
    const inferredRows = await inferNoticesByCategory(pool, profile, pageSize - rows.length, locale);
    const existingIds = new Set(rows.map((r) => Number(r.id)));
    for (const inferredRow of inferredRows) {
      if (!existingIds.has(Number(inferredRow.id))) rows.push(inferredRow);
    }
  }

  // 卡片国际化按需补翻：与推荐模块一致，缺失译文的公告异步触发翻译链
  // 写入缓存，不阻塞当前响应（下次访问即可命中）
  if (locale && noticesRepo) {
    const missingRows = rows.filter((row) => !row.title_i18n);
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

  const items = mapResultItems(rows);
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
  ACTIVE_NOTICE_WHERE,
  NOTICE_SELECT_FIELDS,
  DEADLINE_ORDER,
} from "./filter";
export { inferNoticesByCategory } from "./fuzzy";
export * from "./types";
