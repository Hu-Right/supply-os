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
import { searchWithFilters as meiliSearch, isHealthy as isMeiliHealthy, normalizeNoticeType } from "./meilisearch";
import type { NoticesRepo } from "../repos/notices.repo";
import { getTranslatedNoticeDetail } from "./notice-translation";
import { translateByPattern, classifyAgencyType } from "./agencyI18n";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 性能优化：使用生成列 deadline_sec 替代表达式（阶段 3）
const DEADLINE_SEC_EXPR = "n.deadline_sec";
const ACTIVE_NOTICE_WHERE = `n.is_active = 1`;

export interface NoticeSearchParams {
  page: number;
  pageSize: number;
  codeId?: number;
  q?: string;
  country?: string;
  agency?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  sort?: string;
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

// ── 采购机构下拉缓存类型（提前声明，避免 TDZ 前向引用）──
interface AgencyCacheItem {
  agency: string;
  count: number;
  i18n: Record<string, string> | null;
  /** 该 canonical 对应的数据库原始机构名列表（用于筛选时 IN 匹配） */
  originalAgencies?: string[];
}
let noticeAgenciesCache: { data: AgencyCacheItem[] } | null = null;

// ── F.4 搜索性能预案第一档（本地差异 #7）──
const noticeSearchCache = new Map<string, { payload: NoticeSearchResult; expires: number }>();
const NOTICE_SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 分钟（搜索结果变化低频，延长缓存减少重复查询）
const NOTICE_SEARCH_CACHE_MAX = 200;

// P0 性能优化：COUNT 结果独立缓存——翻页时复用，避免每次重新全量计数
// 回滚：删除 noticeCountCache 相关代码，恢复原始 Promise.all 中始终执行 COUNT 即可
const noticeCountCache = new Map<string, { total: number; expires: number }>();
const NOTICE_COUNT_CACHE_TTL = 10 * 60 * 1000; // 10 分钟（总数变化低频，延长缓存提升命中率）
const NOTICE_COUNT_CACHE_MAX = 200;

// P1 性能优化：精选计数独立缓存——精选总数变化极低频，30 分钟 TTL 避免重复计算
// 回滚：删除 featuredCountCache 相关代码，恢复走通用 COUNT 缓存逻辑
const featuredCountCache = { total: 0, expires: 0 };
const FEATURED_COUNT_CACHE_TTL = 30 * 60 * 1000; // 30 分钟

function searchCacheKey(p: NoticeSearchParams): string {
  return JSON.stringify([
    p.page, p.pageSize, p.codeId || 0, p.q || "", p.country || "", p.agency || "",
    p.deadlineFrom || "", p.deadlineTo || "", p.sort || "deadline_farthest",
    p.deadlineWithinDays || 0, p.noticeType || "", !!p.featuredOnly, p.locale || "",
  ]);
}

/** COUNT 缓存 key：与 searchCacheKey 相同但不含 page/pageSize（翻页不影响总数） */
function countCacheKey(p: NoticeSearchParams): string {
  return JSON.stringify([
    "count", p.codeId || 0, p.q || "", p.country || "", p.agency || "",
    p.deadlineFrom || "", p.deadlineTo || "", p.sort || "deadline_farthest",
    p.deadlineWithinDays || 0, p.noticeType || "", !!p.featuredOnly,
  ]);
}

// ── 方案C：预计算总数表 ──
// 将常用筛选组合的总数预存入 crm_notice_stats 表，消除 COUNT(DISTINCT) 全表扫描
// 回滚：删除 statsKeyFor / refreshNoticeStats / getStatsCount 函数，恢复原始 COUNT 逻辑

// ── 采购类型映射缓存：避免每次 DISTINCT 查询冷启动 5s ──
// DISTINCT notice_type 仅 ~15 种值，变化极低频，10 分钟 TTL 足够
let _noticeTypeCache: { types: string[]; expires: number } | null = null;
const NOTICE_TYPE_CACHE_TTL = 10 * 60 * 1000; // 10 min

async function getCachedNoticeTypes(pool: Pool): Promise<string[]> {
  if (_noticeTypeCache && _noticeTypeCache.expires > Date.now()) {
    return _noticeTypeCache.types;
  }
  const [rows] = await pool.query(
    "SELECT DISTINCT notice_type FROM crm_bid_notices WHERE is_active = 1 AND notice_type IS NOT NULL"
  );
  const types = (rows as any[]).map((r) => r.notice_type);
  _noticeTypeCache = { types, expires: Date.now() + NOTICE_TYPE_CACHE_TTL };
  return types;
}

/** 根据搜索参数生成统计表 key；无法映射时返回 null（回退到 COUNT 查询） */
function statsKeyFor(p: NoticeSearchParams): string | null {
  // 仅支持无关键词 + 无复杂筛选的场景
  if (p.q) return null; // 关键词搜索无法预计算
  if (p.codeId) return null; // UNSPSC 筛选无法预计算
  if (p.deadlineFrom || p.deadlineTo || p.deadlineWithinDays) return null; // 日期筛选无法预计算
  if (p.noticeType) return null; // 采购类型筛选无法预计算
  // BUG4 修复：默认排序 deadline_farthest 不影响总数，应允许使用统计表
  if (p.sort && p.sort !== "deadline_farthest") return null; // 非默认排序无法预计算
  if (p.country && p.agency) return null; // 双条件组合暂不预计算
  // BUG-5 修复：精选+国家/机构组合必须返回 null，否则统计表 key 碰撞导致返回非精选总数
  if (p.featuredOnly && (p.country || p.agency)) return null;
  if (p.country) return `country:${p.country}`;
  if (p.agency) return `agency:${p.agency}`;
  if (p.featuredOnly) return "featured";
  return "active_total";
}

/** 从统计表读取预计算总数；未命中返回 null */
async function getStatsCount(pool: Pool, key: string): Promise<number | null> {
  try {
    const [rows] = await pool.query(
      "SELECT stat_value FROM crm_notice_stats WHERE stat_key = ?",
      [key]
    );
    const arr = rows as any[];
    return arr.length > 0 ? Number(arr[0].stat_value) : null;
  } catch {
    return null; // 表不存在或查询失败，静默回退
  }
}

// ── 方案D：is_active 预计算列回填 + 定期刷新 ──
// 将复杂的 OR 条件预计算为单列等值查询，配合索引实现高效扫描
// 回滚：删除 refreshIsActive 函数，恢复原始 WHERE 条件

/** 回填/刷新 is_active 列——将过期或已过截止日期的公告标记为 inactive，返回变更的 ID 列表 */
export async function refreshIsActive(pool: Pool): Promise<{ marked: number; unmarked: number; changedIds: number[] }> {
  try {
    const t0 = Date.now();
    // 查询即将被停用的 ID（先查后更新，以便同步到 Meilisearch）
    const [toDeactivate] = await pool.query(
      `SELECT id FROM crm_bid_notices
       WHERE is_active = 1
         AND (is_expired = 1 OR (deadline_ts IS NOT NULL AND deadline_sec < UNIX_TIMESTAMP(NOW())))
       LIMIT 10000`
    );
    const deactivateIds = (toDeactivate as any[]).map(r => r.id);

    // 将已过期或已过截止日期的公告标记为 inactive
    const [deactivateResult] = await pool.query(
      `UPDATE crm_bid_notices SET is_active = 0
       WHERE is_active = 1
         AND (is_expired = 1 OR (deadline_ts IS NOT NULL AND deadline_sec < UNIX_TIMESTAMP(NOW())))`
    );
    const marked = (deactivateResult as any)?.affectedRows || 0;

    // 查询即将被重新激活的 ID
    const [toReactivate] = await pool.query(
      `SELECT id FROM crm_bid_notices
       WHERE is_active = 0
         AND (is_expired = 0 OR is_expired IS NULL)
         AND (deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))
       LIMIT 10000`
    );
    const reactivateIds = (toReactivate as any[]).map(r => r.id);

    // 将重新变为活跃的公告恢复
    const [reactivateResult] = await pool.query(
      `UPDATE crm_bid_notices SET is_active = 1
       WHERE is_active = 0
         AND (is_expired = 0 OR is_expired IS NULL)
         AND (deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))`
    );
    const unmarked = (reactivateResult as any)?.affectedRows || 0;

    const changedIds = [...deactivateIds, ...reactivateIds];
    console.log(`[is-active] is_active 刷新完成: ${Date.now() - t0}ms (deactivated=${marked}, reactivated=${unmarked}, changedIds=${changedIds.length})`);
    return { marked, unmarked, changedIds };
  } catch (e) {
    console.error("[is-active] is_active 刷新失败（静默降级）:", (e as Error).message);
    return { marked: 0, unmarked: 0, changedIds: [] };
  }
}

/** 刷新预计算统计表——在数据导入后调用 */
export async function refreshNoticeStats(pool: Pool): Promise<void> {
  try {
    const t0 = Date.now();
    // 方案D：统计表查询使用 is_active=1，与搜索查询保持一致
    // 活跃公告总数
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM crm_bid_notices WHERE is_active = 1`
    );
    const activeTotal = Number((totalRows as any[])[0]?.cnt || 0);

    // 精选公告总数
    const [featuredRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM crm_bid_notices
       WHERE is_featured = 1 AND is_active = 1`
    );
    const featuredTotal = Number((featuredRows as any[])[0]?.cnt || 0);

    // 各国公告数（TOP 50）
    const [countryRows] = await pool.query(
      `SELECT country, COUNT(*) AS cnt FROM crm_bid_notices
       WHERE is_active = 1 AND country IS NOT NULL AND country != ''
       GROUP BY country ORDER BY cnt DESC LIMIT 50`
    );

    // 各机构公告数（TOP 50）
    const [agencyRows] = await pool.query(
      `SELECT agency, COUNT(*) AS cnt FROM crm_bid_notices
       WHERE is_active = 1 AND agency IS NOT NULL AND agency != ''
       GROUP BY agency ORDER BY cnt DESC LIMIT 50`
    );

    // 批量写入统计表
    const entries: [string, number][] = [
      ["active_total", activeTotal],
      ["featured", featuredTotal],
      ...(countryRows as any[]).map((r: any) => [`country:${r.country}` as string, Number(r.cnt)] as [string, number]),
      ...(agencyRows as any[]).map((r: any) => [`agency:${r.agency}` as string, Number(r.cnt)] as [string, number]),
    ];

    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO crm_notice_stats (stat_key, stat_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE stat_value = VALUES(stat_value)`,
        [key, value]
      );
    }

    // 预填充内存缓存：后续请求直接命中内存缓存（<0.1ms），无需再查统计表
    // active_total
    noticeCountCache.set(
      JSON.stringify(["count", 0, "", "", "", "", "", "deadline_farthest", 0, "", false]),
      { total: activeTotal, expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
    );
    // featured
    featuredCountCache.total = featuredTotal;
    featuredCountCache.expires = Date.now() + FEATURED_COUNT_CACHE_TTL;
    // BUG-3 修复：同步预填充 noticeCountCache 的精选维度 key，
    // 避免首次 featured=1 查询因 key 不匹配而回退到 COUNT 查询
    noticeCountCache.set(
      JSON.stringify(["count", 0, "", "", "", "", "", "deadline_farthest", 0, "", true]),
      { total: featuredTotal, expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
    );
    // country:{name}
    for (const row of countryRows as any[]) {
      noticeCountCache.set(
        JSON.stringify(["count", 0, "", row.country, "", "", "", "deadline_farthest", 0, "", false]),
        { total: Number(row.cnt), expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
      );
    }
    // agency:{name}
    for (const row of agencyRows as any[]) {
      noticeCountCache.set(
        JSON.stringify(["count", 0, "", "", row.agency, "", "", "deadline_farthest", 0, "", false]),
        { total: Number(row.cnt), expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
      );
    }

    console.log(`[notice-stats] 统计表刷新完成: ${entries.length} 条, ${Date.now() - t0}ms (active=${activeTotal}, featured=${featuredTotal}, 内存缓存已预填充)`);
  } catch (e) {
    console.error("[notice-stats] 统计表刷新失败（静默降级）:", (e as Error).message);
  }
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

  // ── Meilisearch 优先路径（条件搜索 + 排序 + 分页，< 200ms）──
  // 触发条件：Meilisearch 健康 + 无 UNSPSC 行业筛选 + 非聚合机构类型
  // 降级：searchWithFilters 返回 null 或抛异常时自动回退 MySQL FULLTEXT
  let meiliHit = false;
  let total = 0;
  let pageIds: number[] = [];
  let countMs = 0;
  let idMs = 0;
  let searchMode = "mysql";
  // 混合搜索：Meilisearch 预筛选 ID 集合（供 FULLTEXT 约束搜索范围）
  let meiliFilteredIds: number[] | null = null;

  // 提前检测中文（用于搜索模式日志）
  const isChinese = /[\u4e00-\u9fff]/.test(q);

  // ── UNSPSC 行业分类预解析：将 codeId 转换为 Meilisearch 可用的 level + levelId ──
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

  // Meilisearch 仅用于纯筛选场景（无关键词）——关键词搜索由 MySQL FULLTEXT 负责（覆盖率更高）
  // Meilisearch 分词/排名语义与 MySQL FULLTEXT+LIKE 不同，关键词场景会丢失大量匹配
  if (!p.codeId && !q && isMeiliHealthy()) {
    const meiliStart = Date.now();
    // 解析 canonical 机构名为数据库原始名列表（供 Meilisearch 筛选）
    let meiliAgencies: string[] | undefined;
    if (agency) {
      const _items = noticeAgenciesCache?.data || [];
      const _cached = _items.find((item) => item.agency === agency);
      meiliAgencies = _cached?.originalAgencies && _cached.originalAgencies.length > 0
        ? _cached.originalAgencies
        : [agency]; // 缓存未命中，回退用传入值
    }
    const meiliResult = await meiliSearch({
      q: q || undefined,
      country: country || undefined,
      agencies: meiliAgencies,
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
      searchMode = !q ? "meili-filter" : isChinese ? "meili-zh" : "meili-en";
      console.log(`[search-perf] mode=${searchMode} page=${p.page} q="${q}" country="${country}" agency="${agency}"` +
        ` | Meilisearch=${meiliMs}ms | total=${total} | ids=${pageIds.length}`);
    }
  }

  if (!meiliHit) {
    // ── MySQL FULLTEXT 降级路径 ──
    searchMode = !q ? "mysql-none" : isChinese ? "mysql-zh-FULLTEXT" : "mysql-en-FULLTEXT";
    console.log(`[search-perf] fallback MySQL mode=${searchMode} q="${q}" country="${country}"`);
  }

  // ── 混合搜索路径：关键词 + 筛选条件 → Meilisearch 预筛选 + MySQL FULLTEXT 关键词匹配 ──
  // Meilisearch 处理筛选条件（国家/机构/日期/精选/UNSPSC）得到 ID 集合，MySQL FULLTEXT 仅在该集合内搜索关键词
  // 效果：FULLTEXT 搜索范围从 70K 行缩小到筛选后的几百/几千行，冷启动性能大幅提升
  const hasHybridFilters = country || agency || deadlineFrom || deadlineTo || deadlineWithinDays || noticeType || featuredOnly;
  const hasUnspscFilter = p.codeId && meiliCanHandleUnspsc;
  if (q && isMeiliHealthy() && (hasHybridFilters || hasUnspscFilter)) {
    const hybridStart = Date.now();
    let hybridAgencies: string[] | undefined;
    if (agency) {
      const _items = noticeAgenciesCache?.data || [];
      const _cached = _items.find((item) => item.agency === agency);
      hybridAgencies = _cached?.originalAgencies?.length ? _cached.originalAgencies : [agency];
    }
    const hybridResult = await meiliSearch({
      country: country || undefined,
      agencies: hybridAgencies,
      deadlineFrom: deadlineFrom || undefined,
      deadlineTo: deadlineTo || undefined,
      deadlineWithinDays: deadlineWithinDays || undefined,
      noticeType: noticeType || undefined,
      featuredOnly: featuredOnly || undefined,
      unspscLevel: hasUnspscFilter ? unspscLevel : undefined,
      unspscLevelId: hasUnspscFilter ? unspscLevelId : undefined,
      sort, page: 1, pageSize: 10000,
    });
    if (hybridResult && hybridResult.total <= 10000) {
      meiliFilteredIds = hybridResult.ids;
      const hybridMs = Date.now() - hybridStart;
      console.log(`[search-perf] hybrid: Meilisearch 预筛选 ${hybridResult.total} IDs in ${hybridMs}ms → FULLTEXT 将在该范围内搜索关键词 "${q}"`);
    } else {
      const hybridMs = Date.now() - hybridStart;
      console.log(`[search-perf] hybrid: 筛选结果 ${hybridResult?.total ?? '?'} 条 > 10K 阈值，降级到纯 MySQL (${hybridMs}ms)`);
    }
  }

  const where: string[] = ["n.is_active = 1"];
  const params: any[] = [];
  let join = "";
  let idFilterSql = "";
  const idFilterParams: any[] = [];

  if (p.codeId) {
    if (meiliCanHandleUnspsc && meiliFilteredIds) {
      // Meilisearch 已处理 UNSPSC 筛选（纯筛选或混合搜索路径）
      // idFilterSql 保持空，meiliFilteredIds 已在 WHERE/UNION 中约束
      console.log(`[search-perf] UNSPSC: Meilisearch 已筛选 codeId=${p.codeId} → ${meiliFilteredIds.length} IDs`);
    } else if (meiliCanHandleUnspsc && !meiliFilteredIds && !q) {
      // 纯 UNSPSC 筛选（无关键词）：Meilisearch 处理行业 + 其他筛选 + 分页
      // 解析机构名（与其他 Meilisearch 路径口径一致）
      let unspscAgencies: string[] | undefined;
      if (agency) {
        const _items = noticeAgenciesCache?.data || [];
        const _cached = _items.find((item) => item.agency === agency);
        unspscAgencies = _cached?.originalAgencies?.length ? _cached.originalAgencies : [agency];
      }
      const unspscStart = Date.now();
      const unspscResult = await meiliSearch({
        country: country || undefined,
        agencies: unspscAgencies,
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
        searchMode = "meili-unspsc";
        const unspscMs = Date.now() - unspscStart;
        console.log(`[search-perf] mode=meili-unspsc codeId=${p.codeId} | Meilisearch=${unspscMs}ms | total=${total}`);
      } else {
        // Meilisearch 失败，降级到 MySQL 桥接表
        const filter = await buildNoticeUnspscFilter(pool, p.codeId);
        idFilterSql = filter.sql;
        idFilterParams.push(...filter.params);
      }
    } else {
      // Meilisearch 不可用或 level 不支持，降级到 MySQL 桥接表
      const filter = await buildNoticeUnspscFilter(pool, p.codeId);
      idFilterSql = filter.sql;
      idFilterParams.push(...filter.params);
    }
  }

  const compactQ = q.replace(/\s+/g, "").toUpperCase();
  const likeQ = `%${q}%`;

  // 关键词匹配 UNION 分支（不含外层 n.id IN(...)，由 COUNT/ID 查询统一包裹）
  let kwUnionSql = "";
  
  const kwUnionParams: any[] = [];

  if (q) {
    // 混合搜索：在 Meilisearch 预筛选的 ID 范围内做 FULLTEXT 关键词匹配
    // 每个 UNION 分支添加 n.id IN (...) 约束，MySQL 可用主键索引快速定位行再检查 FULLTEXT
    const idSql = meiliFilteredIds
      ? ` AND n2.id IN (${meiliFilteredIds.map(() => "?").join(",")})`
      : "";
    const idSqlSn = meiliFilteredIds
      ? ` AND sn.id IN (${meiliFilteredIds.map(() => "?").join(",")})`
      : "";
    const idSqlMain = meiliFilteredIds
      ? ` AND n2.id IN (${meiliFilteredIds.map(() => "?").join(",")})`
      : "";
    const idParamsPerBranch = meiliFilteredIds || [];

    if (isChinese) {
      // 中文路径：FULLTEXT(ngram) 主表 + 翻译表 LIKE 补充
      // FULLTEXT ngram 对中文翻译实测返回 0 结果，必须用 LIKE（同语言匹配）
      // 性能优化：通过临时表物化，LIKE 仅执行一次（COUNT/ID 复用）
      kwUnionSql =
        "SELECT n2.id FROM crm_bid_notices n2 WHERE n2.is_active = 1" + idSqlMain + " AND MATCH(n2.title, n2.reference, n2.description) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT qzh.notice_id FROM crm_notice_translations qzh WHERE qzh.lang = 'zh' AND (qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?)";
      kwUnionParams.push(q, ...idParamsPerBranch, likeQ, likeQ);
    } else {
      // 英文路径：FULLTEXT(非ngram) title+reference + FULLTEXT description + 翻译表 FULLTEXT
      kwUnionSql =
        "SELECT n2.id FROM crm_bid_notices n2 WHERE n2.is_active = 1" + idSql + " AND MATCH(n2.title, n2.reference) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT sn.id FROM crm_bid_notices sn WHERE sn.is_active = 1" + idSqlSn + " AND MATCH(sn.description) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT qen.notice_id FROM crm_notice_translations qen WHERE qen.lang = 'en' AND MATCH(qen.title_tr, qen.description_tr) AGAINST(? IN BOOLEAN MODE)";
      kwUnionParams.push(q, ...idParamsPerBranch, q, ...idParamsPerBranch, q);
    }
  }
  if (country) {
    // 精确匹配：国家值来自下拉（GROUP BY n.country 的精确值），LIKE 会误命中
    // 包含关系的国家（Guinea→Equatorial Guinea/Guinea-Bissau、Sudan→South Sudan 等）
    where.push("n.country = ?");
    params.push(country);
  }
  if (agency) {
    // 查找该 canonical 对应的数据库原始机构名列表（别名映射后 canonical 可能与 DB 值不同）
    const _agencyItems = noticeAgenciesCache?.data || [];
    const cachedItem = _agencyItems.find((item) => item.agency === agency);
    if (cachedItem?.originalAgencies && cachedItem.originalAgencies.length > 1) {
      // 多个原始名（聚合类型或别名归并）：使用 IN 匹配所有原始机构名
      const placeholders = cachedItem.originalAgencies.map(() => "?").join(",");
      where.push(`n.agency IN (${placeholders})`);
      params.push(...cachedItem.originalAgencies);
    } else if (cachedItem?.originalAgencies && cachedItem.originalAgencies.length === 1) {
      // 单个原始名：精确匹配（最常见路径）
      where.push("n.agency = ?");
      params.push(cachedItem.originalAgencies[0]);
    } else {
      // 缓存未命中（冷启动）：直接用传入值精确匹配
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
    if (meiliFilteredIds) {
      // 混合搜索：Meilisearch 已通过 normalizeNoticeType 处理 noticeType 筛选
      // meiliFilteredIds 仅包含匹配规范化类型的公告，无需再在 MySQL 中重复筛选
      // 跳过 LIKE 避免：1) 结果不一致（LIKE 只匹配原始值，丢失别名匹配）2) 全表扫描 6000ms+
    } else {
      // MySQL 降级路径：预解析匹配的 notice_type 值 → IN() 精确匹配替代 LIKE '%type%'
      // 性能：缓存命中时 0ms + IN() 走索引；缓存未命中时首次 ~5s，后续 0ms
      // 正确性：通过 normalizeNoticeType 匹配所有别名（如 "RFQ" 匹配 "Request for quotation"）
      try {
        const allTypes = await getCachedNoticeTypes(pool);
        const normalizedInput = normalizeNoticeType(noticeType);
        const matchingTypes = allTypes.filter((t) => normalizeNoticeType(t) === normalizedInput);
        if (matchingTypes.length > 0) {
          where.push(`n.notice_type IN (${matchingTypes.map(() => "?").join(",")})`);
          params.push(...matchingTypes);
        } else {
          // 无匹配类型 → 强制空结果
          where.push("1 = 0");
        }
      } catch (err) {
        // 缓存查询失败：记录警告并跳过 noticeType 筛选（避免 ESCAPE SQL 语法错误）
        console.warn(`[noticeSearch] noticeType 预解析失败，跳过该筛选: ${(err as Error).message}`);
      }
    }
  }
  // P6 性能优化：精选过滤改用预计算列 is_featured，消除 FEATURED_NOTICE_EXISTS 双路 IN 子查询
  // 回滚：恢复 where.push(FEATURED_NOTICE_EXISTS)
  if (featuredOnly) {
    where.push("n.is_featured = 1");
  }

  // P0 性能优化：COUNT 查询瘦身——分离仅影响 SELECT 展示的 JOIN
  // 回滚：将 locale/英文回退/opp_desc JOIN 恢复合并到 join 变量，COUNT 使用 join + params
  // 卡片国际化：locale 参数独立于 WHERE params，不纳入 COUNT 查询
  // P4 两阶段查询：展示用 JOIN 独立于过滤 JOIN，阶段 2 按 ID 获取详情时使用
  // 回滚：将 displayJoin 的两行 LEFT JOIN 移回 join 变量，恢复单查询模式
  const localeParams: any[] = [];
  let displayJoin = "";
  // P6 修复：tr JOIN 必须始终存在（SELECT 无条件引用 tr.title_tr），无 locale 时 lang=NULL 不匹配任何行，等效于纯 NULL 列
  displayJoin += " LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?";
  localeParams.push(locale || null);
  // 英文回退 JOIN：当前语言无译文时回退到英文缓存
  displayJoin += " LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  // COUNT 专用 JOIN：仅 UNSPSC 行业筛选 JOIN（英文路径不再需要翻译表 JOIN）
  // 回滚：恢复英文路径的 LEFT JOIN crm_notice_translations qzh/qen
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
    // 截至最远优先：deadline_sec DESC（NULL 无截止日期排最前，MySQL DESC 排序 NULL 默认在前）
    // 方案D：is_active=1 保证 deadline_sec 要么为 NULL 要么 >= NOW()，可安全走索引排序
    orderParts.push(`${DEADLINE_SEC_EXPR} DESC`, "n.id DESC");
  } else {
    // deadline = 截止最近优先（deadline_sec ASC，NULL 无截止日期排最后）
    orderParts.push(`${DEADLINE_SEC_EXPR} IS NULL`, DEADLINE_SEC_EXPR, "n.id DESC");
  }
  const orderSql = orderParts.join(", ");
  const whereSql = where.join(" AND ");

  // P0 性能优化：COUNT 结果缓存——翻页及首次加载时复用，避免每次重新全量计数
  // 回滚：删除 noticeCountCache 相关代码，恢复原始 Promise.all 中始终执行 COUNT 即可
  const cKey = countCacheKey(p);
  const cachedCount = noticeCountCache.get(cKey);
  // 首次加载（page=1）也读缓存：countCacheKey 不含 locale，不同语言共享同一 total
  const useCachedCount = cachedCount && cachedCount.expires > Date.now();

  // P1 性能优化：精选计数独立缓存——精选总数变化极低频，跳过昂贵的双路 IN 子查询
  // 回滚：删除 featuredCountCache 分支，统一走通用 COUNT 缓存
  // BUG-2 修复：仅当无其他筛选条件时才使用精选计数缓存，避免关键字/国家/机构等组合筛选时
  // 返回全部精选总数（如 50）而非实际匹配数（如 3），导致分页显示大量空页
  const hasOtherFilters = !!(p.q || p.country || p.agency || p.codeId
    || p.deadlineFrom || p.deadlineTo || p.deadlineWithinDays || p.noticeType);
  const useFeaturedCache = featuredOnly && !hasOtherFilters && featuredCountCache.expires > Date.now();

  let countPromise: Promise<any>;
  // 方案C：优先级链——精选内存缓存 > 统计表(<1ms) > 通用COUNT缓存 > COUNT查询
  // 统计表优先于通用COUNT缓存：冷启动时统计表直接返回（<1ms），无需等待warmup填充缓存
  const statsKey = statsKeyFor(p);
  if (useFeaturedCache) {
    // 精选计数缓存命中：跳过 SQL
    countPromise = Promise.resolve([[{ total: featuredCountCache.total }]]);
  } else if (statsKey) {
    // 方案C：查统计表（<1ms）→ 命中则写入内存缓存 → 未命中回退 COUNT 缓存/查询
    countPromise = getStatsCount(pool, statsKey).then((statsTotal) => {
      if (statsTotal !== null) {
        // 统计表命中：写入内存缓存避免下次重复查表
        if (featuredOnly) {
          featuredCountCache.total = statsTotal;
          featuredCountCache.expires = Date.now() + FEATURED_COUNT_CACHE_TTL;
        } else {
          noticeCountCache.set(cKey, { total: statsTotal, expires: Date.now() + NOTICE_COUNT_CACHE_TTL });
        }
        console.log(`[notice-stats] 统计表命中: key=${statsKey} total=${statsTotal}`);
        return [[{ total: statsTotal }]];
      }
      // 统计表未命中：检查通用 COUNT 缓存
      if (useCachedCount) {
        return [[{ total: cachedCount!.total }]];
      }
      // 缓存也未命中：回退到 COUNT 查询
      return runCountQuery();
    });
  } else if (useCachedCount) {
    // 通用 COUNT 缓存命中（statsKey=null 的复杂筛选场景）
    countPromise = Promise.resolve([[{ total: cachedCount.total }]]);
  } else {
    // 无缓存可用：执行 COUNT 查询
    countPromise = runCountQuery();
  }

  /** 执行 COUNT 查询并写入缓存 */
  function runCountQuery(): Promise<any> {
    let countQuery: string;
    let countParams: any[];
    if (q) {
      // 关键词搜索：JOIN 回主表以应用 WHERE 条件（精选/国家/机构/日期等筛选）
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

  // ── 性能监控：分阶段计时 ─
  const t0 = Date.now();
  let t1 = t0;

  // P4 两阶段查询：阶段 1 轻量 ID 分页，阶段 2 按 ID 批量获取详情
  // 方案F3：中英文关键词均走主表 FULLTEXT，查询结构统一

  if (!meiliHit) {
  const countTimed = countPromise.then((r: any) => { countMs = Date.now() - t0; return r; });
  const idQueryStart = Date.now();
  let idQuery: string;
  let idQueryParams: any[];
  if (q) {
    // 关键词搜索：n.id IN (UNION derived table) 过滤 + 排序分页
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
  } // end if (!meiliHit) — MySQL 查询执行结束

  // 阶段 2：按 ID 批量获取详情
  let detailRows: RowDataPacket[] = [];
  if (pageIds.length > 0) {
    const [dRows] = await pool.query(
      `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
         n.deadline, n.deadline_ts, n.deadline_sec, n.estimated_value, n.agency,
         LEFT(n.description, 300) AS description,
         tr.title_tr AS title_i18n, tr.description_tr AS description_i18n,
         tre.title_tr AS title_en, tre.description_tr AS description_en,
         (SELECT opp.description_cn FROM crm_bid_opportunities opp WHERE opp.source_notice_id = n.notice_id AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1) LIMIT 1) AS description_cn,
         (SELECT LEFT(opp.bid_overview, 200) FROM crm_bid_opportunities opp WHERE opp.source_notice_id = n.notice_id AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1) LIMIT 1) AS bid_overview,
         (SELECT opp.beneficiary_countries FROM crm_bid_opportunities opp WHERE opp.source_notice_id = n.notice_id AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1) LIMIT 1) AS beneficiary_countries
       FROM crm_bid_notices n ${displayJoin}
       WHERE n.id IN (${pageIds.map(() => "?").join(",")})
       ORDER BY FIELD(n.id, ${pageIds.map(() => "?").join(",")})`,
      [...localeParams, ...pageIds, ...pageIds]
    );
    detailRows = dRows as RowDataPacket[];
  }

  const t2 = Date.now();

  // P0：首页写入 COUNT 缓存（非首页不写，避免翻页时 stale 条件覆盖）
  if (page === 1 && total > 0) {
    if (noticeCountCache.size >= NOTICE_COUNT_CACHE_MAX) {
      const now = Date.now();
      for (const [key, entry] of noticeCountCache) { if (entry.expires <= now) noticeCountCache.delete(key); }
      if (noticeCountCache.size >= NOTICE_COUNT_CACHE_MAX) noticeCountCache.clear();
    }
    noticeCountCache.set(cKey, { total, expires: Date.now() + NOTICE_COUNT_CACHE_TTL });
  }

  const breakdownCounts = new Map<number, number>();
  // 页级 is_featured 标注：featuredOnly 时全部命中，否则仅对当页 ≤30 条回查三路判定
  const featuredIds = new Set<number>();
  
  if (pageIds.length > 0) {
    if (featuredOnly) {
      for (const id of pageIds) featuredIds.add(id);
    } else {
      // P6 性能优化：精选标注改用预计算列，消除回查子查询
      // 回滚：恢复 AND ${FEATURED_NOTICE_EXISTS}
      try {
        const [featResult, docResult] = await Promise.all([
          pool.query(
            `SELECT id FROM crm_bid_notices WHERE id IN (${pageIds.map(() => "?").join(",")}) AND is_featured = 1`,
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

  const payload: NoticeSearchResult = {
    items: rawRows.map((row) => ({
      ...row, organization: null, source_url: null, unspsc_codes: [], core_locked: true,
      is_featured: featuredIds.has(Number(row.id)),
      breakdown_file_count: breakdownCounts.has(Number(row.id)) ? breakdownCounts.get(Number(row.id)) : undefined,
    })),
    total, page, pageSize,
  };

  // ── 性能监控日志 ──
  console.log(`[search-perf] mode=${searchMode} page=${page} q="${q}" country="${country}" codeId=${p.codeId || "-"} featured=${featuredOnly}` +
    ` | COUNT=${countMs}ms | IDs=${idMs}ms | Phase1=${t1 - t0}ms | Phase2=${t2 - t1}ms | Phase3=${t3 - t2}ms | TOTAL=${t3 - t0}ms`);

  if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) {
    const now = Date.now();
    for (const [key, entry] of noticeSearchCache) { if (entry.expires <= now) noticeSearchCache.delete(key); }
    if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) noticeSearchCache.clear();
  }
  noticeSearchCache.set(cacheKey, { payload, expires: Date.now() + NOTICE_SEARCH_CACHE_TTL });

  return payload;
}

// ── G.3 国家下拉数据源（每日凌晨 5 点定时刷新，启动时预热）──
let noticeCountriesCache: { data: Array<{ country: string; count: number }> } | null = null;

/** 从数据库重新查询并刷新国家缓存 */
export async function refreshNoticeCountries(pool: Pool): Promise<Array<{ country: string; count: number }>> {
  const [rows] = await pool.query(
    `SELECT n.country, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE n.is_active = 1 AND n.country IS NOT NULL AND n.country <> ''
     GROUP BY n.country ORDER BY cnt DESC`
  );
  const data = (rows as RowDataPacket[]).map((row) => ({ country: row.country, count: Number(row.cnt) }));
  noticeCountriesCache = { data };
  return data;
}

/** 读取国家缓存（启动预热后始终有数据，未预热时惰性加载兜底） */
export async function getNoticeCountries(pool: Pool): Promise<Array<{ country: string; count: number }>> {
  if (noticeCountriesCache) return noticeCountriesCache.data;
  return refreshNoticeCountries(pool);
}

// ── 采购机构下拉数据源（每日凌晨 5 点定时刷新，启动时预热）──
// P2 性能优化：归一化去重——TRIM + 大小写归并 + 别名映射 + i18n 多语言
// 注意：AgencyCacheItem 和 noticeAgenciesCache 已移至文件顶部声明

/** 从数据库重新查询并刷新机构缓存（归一化去重 + 别名映射 + i18n，返回全量数据） */
export async function refreshNoticeAgencies(pool: Pool): Promise<AgencyCacheItem[]> {
  // 1) 加载机构别名映射表（alias → canonical + name_i18n）
  const aliasMap = new Map<string, { canonical: string; i18n: Record<string, string> | null }>();
  try {
    const [aliasRows] = await pool.query("SELECT canonical, alias, name_i18n FROM crm_agency_aliases");
    for (const row of aliasRows as RowDataPacket[]) {
      const canonical = String(row.canonical || "").trim();
      let i18n: Record<string, string> | null = null;
      if (row.name_i18n) {
        try {
          i18n = typeof row.name_i18n === "string" ? JSON.parse(row.name_i18n) : row.name_i18n;
        } catch { /* JSON 解析失败则保持 null */ }
      }
      aliasMap.set(String(row.alias || "").trim().toUpperCase(), { canonical, i18n });
    }
  } catch {
    // 表不存在或查询失败：静默降级，仅走大小写归一化
  }

  // 2) 查询原始机构数据
  const [rows] = await pool.query(
    `SELECT n.agency, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE n.is_active = 1 AND n.agency IS NOT NULL AND n.agency <> ''
     GROUP BY n.agency ORDER BY cnt DESC`
  );

  // 3) 归一化去重：TRIM + 大写归并 + 别名映射 + i18n 合并
  const merged = new Map<string, AgencyCacheItem>();
  // 记录每个 canonical 对应的原始机构名列表（用于筛选展开）
  const canonicalToOriginals = new Map<string, string[]>();
  for (const row of rows as RowDataPacket[]) {
    const raw = String(row.agency || "").trim();
    if (!raw) continue;
    const upperKey = raw.toUpperCase();
    const aliasEntry = aliasMap.get(upperKey);
    const canonical = aliasEntry?.canonical || raw;
    const i18n = aliasEntry?.i18n || null;
    const mergeKey = canonical.toUpperCase();
    const existing = merged.get(mergeKey);
    if (existing) {
      existing.count += Number(row.cnt);
      // 合并 i18n：已有条目缺少翻译时从新条目补充
      if (!existing.i18n && i18n) existing.i18n = i18n;
    } else {
      merged.set(mergeKey, { agency: canonical, count: Number(row.cnt), i18n });
    }
    // 记录原始机构名
    const originals = canonicalToOriginals.get(mergeKey) || [];
    originals.push(raw);
    canonicalToOriginals.set(mergeKey, originals);
  }

  // 3.5) 对无 i18n 的条目，尝试模式化翻译兜底
  for (const [, item] of merged) {
    if (!item.i18n) {
      const patternResult = translateByPattern(item.agency);
      if (patternResult) {
        item.i18n = patternResult.i18n;
        // 如果模式翻译给出了更规范的标准名，且原名无别名映射，则替换
        if (patternResult.canonical !== item.agency && !aliasMap.has(item.agency.toUpperCase())) {
          item.agency = patternResult.canonical;
        }
      }
    }
  }

  // 3.6) 类型聚合：将同类型机构合并（如 1922 个巴西市政府 → 1 个「巴西各市政府」）
  const typeAggregated = new Map<string, AgencyCacheItem>();
  for (const [mergeKey, item] of merged) {
    const typeInfo = classifyAgencyType(item.agency);
    if (typeInfo) {
      // 应聚合到类型
      const existing = typeAggregated.get(typeInfo.typeKey);
      const originals = canonicalToOriginals.get(mergeKey) || [];
      if (existing) {
        existing.count += item.count;
        // 累加原始机构名列表
        if (existing.originalAgencies) {
          existing.originalAgencies.push(...originals);
        }
      } else {
        typeAggregated.set(typeInfo.typeKey, {
          agency: typeInfo.typeKey,
          count: item.count,
          i18n: typeInfo.i18n,
          originalAgencies: [...originals],
        });
      }
    } else {
      // 不聚合，保留独立条目（仍需记录原始机构名，canonical 可能与 DB 原始值不同）
      const key = item.agency.toUpperCase();
      const originals = canonicalToOriginals.get(mergeKey) || [];
      typeAggregated.set(key, { ...item, originalAgencies: originals });
    }
  }

  // 4) 按合并后计数降序排列，返回全量数据（不再截断）
  const data = Array.from(typeAggregated.values())
    .sort((a, b) => b.count - a.count);
  noticeAgenciesCache = { data };
  return data;
}

/** 读取机构缓存，按 locale 解析翻译名（启动预热后始终有数据，未预热时惰性加载兜底） */
export async function getNoticeAgencies(
  pool: Pool,
  locale?: string,
): Promise<Array<{ agency: string; count: number; agency_i18n?: string }>> {
  const items = noticeAgenciesCache ? noticeAgenciesCache.data : await refreshNoticeAgencies(pool);
  // en 直接用 canonical（即英文），其余语言附加翻译（含 zh）
  const lang = locale?.toLowerCase();
  if (!lang || lang === "en") {
    return items.map(({ agency, count }) => ({ agency, count }));
  }
  return items.map(({ agency, count, i18n }) => {
    const translated = i18n?.[lang];
    return translated ? { agency, count, agency_i18n: translated } : { agency, count };
  });
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
  // P6 性能优化：精选计数改用预计算列
  // 回滚：恢复 AND ${FEATURED_NOTICE_EXISTS}
  const [featuredRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE} AND n.is_featured = 1`
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
