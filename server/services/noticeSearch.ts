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
import { translateByPattern, classifyAgencyType, COUNTRY_ZH } from "./agencyI18n";

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
  /** PERF 优化：聚合组标识（如 "BR_municipality"），用于 Meilisearch 筛选时替代数百个 OR 条件 */
  agencyGroup?: string;
}
let noticeAgenciesCache: { data: AgencyCacheItem[]; timestamp: number } | null = null;
// BUG 修复：机构缓存增加 TTL 机制（10 分钟），避免代码修复后旧数据永久滞留
// 原问题：noticeAgenciesCache 无过期时间，服务启动后永不刷新（除非凌晨 5 点定时或重启）
const AGENCIES_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

// ── F.4 搜索性能预案第一档（本地差异 #7）──
const noticeSearchCache = new Map<string, { payload: NoticeSearchResult; expires: number }>();
const NOTICE_SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 分钟（搜索结果变化低频，延长缓存减少重复查询）
const NOTICE_SEARCH_CACHE_MAX = 500;

// P0 性能优化：COUNT 结果独立缓存——翻页时复用，避免每次重新全量计数
// 回滚：删除 noticeCountCache 相关代码，恢复原始 Promise.all 中始终执行 COUNT 即可
const noticeCountCache = new Map<string, { total: number; expires: number }>();
const NOTICE_COUNT_CACHE_TTL = 10 * 60 * 1000; // 10 分钟（总数变化低频，延长缓存提升命中率）
const NOTICE_COUNT_CACHE_MAX = 500;

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

    // P3-5 修复：预填充复用 countCacheKey 生成逻辑，避免硬编码数组与 key 函数脱节
    const defaultParams: NoticeSearchParams = {
      page: 1, pageSize: 9, q: "", country: "", agency: "",
      deadlineFrom: "", deadlineTo: "", sort: "deadline_farthest",
      deadlineWithinDays: 0, noticeType: "", featuredOnly: false,
    };
    // active_total
    noticeCountCache.set(
      countCacheKey({ ...defaultParams }),
      { total: activeTotal, expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
    );
    // featured
    featuredCountCache.total = featuredTotal;
    featuredCountCache.expires = Date.now() + FEATURED_COUNT_CACHE_TTL;
    // BUG-3 修复：同步预填充 noticeCountCache 的精选维度 key
    noticeCountCache.set(
      countCacheKey({ ...defaultParams, featuredOnly: true }),
      { total: featuredTotal, expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
    );
    // country:{name}
    for (const row of countryRows as any[]) {
      noticeCountCache.set(
        countCacheKey({ ...defaultParams, country: row.country }),
        { total: Number(row.cnt), expires: Date.now() + NOTICE_COUNT_CACHE_TTL }
      );
    }
    // agency:{name}
    for (const row of agencyRows as any[]) {
      noticeCountCache.set(
        countCacheKey({ ...defaultParams, agency: row.agency }),
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
  // 已废弃：Meilisearch 现在统一处理关键词+筛选，此变量仅保留给降级路径兼容
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

  // PERF 优化：Meilisearch 统一处理关键词 + 筛选 + 排序 + 分页（一步到位）
  // 索引已包含 title_zh/description_zh/title_en/description_en 等翻译字段，
  // Meilisearch charabia 分词器支持中文 ngram，覆盖率与 MySQL FULLTEXT 相当。
  // 消除 IN 子句参数爆炸问题，MySQL 仅负责按 ID 取详情。
  if (!p.codeId && isMeiliHealthy()) {
    const meiliStart = Date.now();
    // 解析 canonical 机构名为数据库原始名列表（供 Meilisearch 筛选）
    // PERF 优化：优先使用 agencyGroup 替代数百个 OR 条件
    let meiliAgencies: string[] | undefined;
    let meiliAgencyGroup: string | undefined;
    if (agency) {
      const _items = noticeAgenciesCache?.data || [];
      const _cached = _items.find((item) => item.agency === agency);
      // PERF 优化：如果有聚合组标识，优先使用（替代数百个 OR 条件）
      if (_cached?.agencyGroup) {
        meiliAgencyGroup = _cached.agencyGroup;
      } else if (_cached?.originalAgencies && _cached.originalAgencies.length > 0) {
        meiliAgencies = _cached.originalAgencies;
      } else {
        meiliAgencies = [agency]; // 缓存未命中，回退用传入值
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

  // ── MySQL FULLTEXT 降级路径（Meilisearch 不可用时）──
  if (!meiliHit) {
    searchMode = q ? (isChinese ? "mysql-zh-FULLTEXT" : "mysql-en-FULLTEXT") : "mysql-none";
    console.log(`[search-perf] fallback MySQL mode=${searchMode} q="${q}" country="${country}"`);
  }

  const where: string[] = ["n.is_active = 1"];
  const params: any[] = [];
  let join = "";
  let idFilterSql = "";
  const idFilterParams: any[] = [];

  // 注：不再过滤无截止日期的记录，改为在排序时将其排在最后
  // 原逻辑：if (sort === "deadline") { where.push(`${DEADLINE_SEC_EXPR} IS NOT NULL`); }

  if (p.codeId) {
    if (meiliCanHandleUnspsc && !q) {
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
    // MySQL FULLTEXT 降级路径关键词匹配（Meilisearch 不可用时使用）
    if (isChinese) {
      // 中文路径：FULLTEXT(ngram) 主表 + 翻译表 LIKE 补充
      kwUnionSql =
        "SELECT n2.id FROM crm_bid_notices n2 WHERE n2.is_active = 1 AND MATCH(n2.title, n2.reference, n2.description) AGAINST(? IN BOOLEAN MODE)" +
        " UNION " +
        "SELECT qzh.notice_id FROM crm_notice_translations qzh WHERE qzh.lang = 'zh' AND (qzh.title_tr LIKE ? OR qzh.description_tr LIKE ?)";
      kwUnionParams.push(q, likeQ, likeQ);
    } else {
      // 英文路径：FULLTEXT(非ngram) title+reference + FULLTEXT description + 翻译表 FULLTEXT
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
      // PERF 优化：聚合机构类型（如"巴西各市政府"）可能包含数百个原始机构名，
      // IN(...) 参数爆炸导致 SQL 极慢。由于聚合机构本身就是按国家归并的，
      // 当有国家筛选时，国家条件已等价约束，跳过机构 IN。
      // 当无国家筛选时，使用原始机构名 IN（但限制数量避免参数爆炸）。
      const AGENCY_IN_LIMIT = 100;
      if (cachedItem.originalAgencies.length > AGENCY_IN_LIMIT && country) {
        // 国家筛选已等价约束，跳过机构筛选
        console.log(`[noticeSearch] agency 聚合优化: ${cachedItem.originalAgencies.length} 个原始机构名 + country="${country}" → 跳过机构 IN`);
      } else if (cachedItem.originalAgencies.length > AGENCY_IN_LIMIT) {
        // 无国家筛选，截取前 N 个避免 IN 参数爆炸
        const truncated = cachedItem.originalAgencies.slice(0, AGENCY_IN_LIMIT);
        const placeholders = truncated.map(() => "?").join(",");
        where.push(`n.agency IN (${placeholders})`);
        params.push(...truncated);
        console.log(`[noticeSearch] agency 截断优化: ${cachedItem.originalAgencies.length} → ${AGENCY_IN_LIMIT} 个`);
      } else {
        // 多个原始名（聚合类型或别名归并）：使用 IN 匹配所有原始机构名
        const placeholders = cachedItem.originalAgencies.map(() => "?").join(",");
        where.push(`n.agency IN (${placeholders})`);
        params.push(...cachedItem.originalAgencies);
      }
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
    // 截至最远优先：deadline_sec DESC（NULL 无截止日期排最后，与 Meilisearch 哨兵值 0 口径一致）
    // IS NULL 升序排前（0=非NULL 在前），再按 deadline_sec 降序，确保无截止日期公告始终在末尾
    orderParts.push(`${DEADLINE_SEC_EXPR} IS NULL`, `${DEADLINE_SEC_EXPR} DESC`, "n.id DESC");
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
  // PERF 优化：将 Phase 3 的 is_featured 和 documents/procurement_files 合并到此查询
  // 消除 2 次额外 DB 往返（原 Phase 3 独立查询 featured + documents）
  let detailRows: RowDataPacket[] = [];
  if (pageIds.length > 0) {
    // PERF 优化：将 3 个关联子查询改为 LEFT JOIN，减少子查询扫描次数
    // 原逻辑：9 条记录 × 3 个子查询 = 27 次子查询扫描
    // 优化后：1 次 LEFT JOIN，MySQL 优化器可高效处理
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

  // P1 性能优化：最后一页短路——当页结果不足一页时，精确推算 total 无需 COUNT
  // 回滚：删除 lastPageShortCircuit 分支，恢复始终执行 COUNT
  const lastPageShortCircuit = pageIds.length > 0 && pageIds.length < pageSize;
  if (lastPageShortCircuit) {
    total = offset + pageIds.length;
    countMs = 0;
    console.log(`[search-perf] COUNT 短路: page=${page} items=${pageIds.length} < pageSize=${pageSize} → total=${total} (0ms)`);
  }

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
  // 页级 is_featured 标注：直接从 Phase 2 详情行中读取（已合并查询）
  // PERF 优化：消除 Phase 3 的 2 次额外 DB 查询
  const featuredIds = new Set<number>();
  
  if (pageIds.length > 0) {
    if (featuredOnly) {
      for (const id of pageIds) featuredIds.add(id);
    } else {
      // PERF 优化：直接从 detailRows 读取 is_featured 和 documents，无需额外查询
      for (const row of detailRows) {
        if (row.is_featured) featuredIds.add(Number(row.id));
        const docCount = normalizeDocumentRows(row.documents, row.procurement_files).length;
        if (docCount > 0) breakdownCounts.set(Number(row.id), docCount);
      }
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

  // P2-2 修复：缓存中剥离翻译字段——翻译随 locale 变化，不应跨用户共享
  // 缓存版本仅保留稳定数据，翻译字段每次从 DB 实时获取
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

  // ── 性能监控日志 ──
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

  // 2) 查询原始机构数据（含国家字段，用于按国家级聚合 INTL 类型机构）
  const [rows] = await pool.query(
    `SELECT n.agency, ANY_VALUE(n.country) AS country, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE n.is_active = 1 AND n.agency IS NOT NULL AND n.agency <> ''
     GROUP BY n.agency ORDER BY cnt DESC`
  );

  // 3) 归一化去重：TRIM + 大写归并 + 别名映射 + i18n 合并
  const merged = new Map<string, AgencyCacheItem>();
  // 记录每个 canonical 对应的原始机构名列表（用于筛选展开）
  const canonicalToOriginals = new Map<string, string[]>();
  // 记录每个 canonical 对应的国家（用于按国家级聚合 INTL 类型机构）
  const canonicalToCountry = new Map<string, string>();
  for (const row of rows as RowDataPacket[]) {
    const raw = String(row.agency || "").trim();
    const country = String(row.country || "").trim();
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
    // 记录国家（第一个非空值优先，因为结果已按 cnt DESC 排序）
    if (country && !canonicalToCountry.has(mergeKey)) {
      canonicalToCountry.set(mergeKey, country);
    }
  }

  // 3.5) 对无 i18n 的条目，尝试模式化翻译兜底
  for (const [, item] of merged) {
    if (!item.i18n) {
      const patternResult = translateByPattern(item.agency);
      if (patternResult) {
        // 如果模式翻译给出了更规范的标准名，且原名无别名映射，则替换
        if (patternResult.canonical !== item.agency && !aliasMap.has(item.agency.toUpperCase())) {
          // 同步更新 canonicalToOriginals：将旧 mergeKey 的原始名列表迁移到新 key
          // BUG 修复：不迁移时步骤 3.6 用新 canonical 查旧 mergeKey 找不到原始机构名列表，
          // 导致 originalAgencies 为空，搜索筛选无法展开匹配所有 DB 原始机构名
          const oldMergeKey = item.agency.toUpperCase();
          const oldOriginals = canonicalToOriginals.get(oldMergeKey);
          const oldCountry = canonicalToCountry.get(oldMergeKey);
          item.agency = patternResult.canonical;
          const newMergeKey = item.agency.toUpperCase();
          if (oldOriginals && !canonicalToOriginals.has(newMergeKey)) {
            canonicalToOriginals.set(newMergeKey, oldOriginals);
          }
          // 同步迁移国家信息
          if (oldCountry && !canonicalToCountry.has(newMergeKey)) {
            canonicalToCountry.set(newMergeKey, oldCountry);
          }
        }
        // BUG 修复：过滤无效翻译——中文翻译与机构英文名完全相同时说明是兜底结果而非真正翻译，
        // 不设置 i18n 以避免前端 agency_i18n 显示英文原名而非中文翻译
        if (patternResult.i18n.zh !== item.agency) {
          item.i18n = patternResult.i18n;
        }
      }
    }
  }

  // 3.6) 类型聚合：将同类型机构合并（如 1922 个巴西市政府 → 1 个「巴西各市政府」）
  // INTL 类型按国家+类型聚合（如「乌干达各委员会」而非全球「各委员会」）
  const typeAggregated = new Map<string, AgencyCacheItem>();
  for (const [mergeKey, item] of merged) {
    const country = canonicalToCountry.get(mergeKey) || undefined;
    const typeInfo = classifyAgencyType(item.agency, country);
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
          // PERF 优化：写入聚合组标识，用于 Meilisearch 筛选时替代数百个 OR 条件
          agencyGroup: typeInfo.typeKey,
        });
      }
    } else {
      // 不聚合，保留独立条目（仍需记录原始机构名，canonical 可能与 DB 原始值不同）
      const key = item.agency.toUpperCase();
      // BUG 修复：始终从 canonicalToOriginals 获取最新原始名列表（step 3.5 可能已迁移 key）
      const originals = canonicalToOriginals.get(mergeKey) || canonicalToOriginals.get(key) || [];
      typeAggregated.set(key, { ...item, originalAgencies: originals });
    }
  }

  // 3.7) 兜底聚合：将公告数极少的零散机构按国家归并为"XX国各机构"
  // 阈值：公告数 <= 5 的独立机构
  const AGENCY_MIN_COUNT = 5;
  const finalAggregated = new Map<string, AgencyCacheItem>();
  const orphanByCountry = new Map<string, AgencyCacheItem>();

  for (const [key, item] of typeAggregated) {
    // 公告数较多的条目直接保留（包括类型聚合后的大类）
    if (item.count > AGENCY_MIN_COUNT) {
      finalAggregated.set(key, item);
      continue;
    }
    // 公告数 <= 阈值的零散机构，按国家归并
    const country = canonicalToCountry.get(key.toUpperCase()) || "";
    const countryZh = COUNTRY_ZH[country];
    if (countryZh) {
      // 有中文国家名 → 归入"XX国各机构"
      const bucketKey = `ORPHAN_${country}`;
      const existing = orphanByCountry.get(bucketKey);
      if (existing) {
        existing.count += item.count;
        if (existing.originalAgencies && item.originalAgencies) {
          existing.originalAgencies.push(...item.originalAgencies);
        }
      } else {
        orphanByCountry.set(bucketKey, {
          agency: bucketKey,
          count: item.count,
          i18n: { zh: `${countryZh}各机构` },
          originalAgencies: item.originalAgencies ? [...item.originalAgencies] : [],
          // PERF 优化：写入聚合组标识，用于 Meilisearch 筛选时替代数百个 OR 条件
          agencyGroup: bucketKey,
        });
      }
    } else {
      // 无国家信息或国家不在映射中 → 归入"其他机构"
      const existing = orphanByCountry.get("ORPHAN_OTHER");
      if (existing) {
        existing.count += item.count;
        if (existing.originalAgencies && item.originalAgencies) {
          existing.originalAgencies.push(...item.originalAgencies);
        }
      } else {
        orphanByCountry.set("ORPHAN_OTHER", {
          agency: "ORPHAN_OTHER",
          count: item.count,
          i18n: { zh: "其他机构" },
          originalAgencies: item.originalAgencies ? [...item.originalAgencies] : [],
          // PERF 优化：写入聚合组标识
          agencyGroup: "ORPHAN_OTHER",
        });
      }
    }
  }

  // 将兜底聚合的条目加入最终结果
  for (const [key, item] of orphanByCountry) {
    finalAggregated.set(key, item);
  }

  // 3.8) 汉化补全：确保所有条目都有真正的中文翻译
  // 检测翻译是否包含大量英文（需要修复）
  const needsTranslationFix = (s: string | undefined, agency: string): boolean => {
    if (!s) return true; // 无翻译
    if (s === agency) return true; // 翻译等于原名
    
    // 统计英文字母和中文字符数量
    const englishLetters = (s.match(/[a-zA-Z]/g) || []).length;
    const chineseChars = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    
    // 如果英文字母数量 > 中文字符数量，说明主要是英文
    if (englishLetters > chineseChars) return true;
    
    // 如果包含连续的英文单词（超过 3 个字母），认为有英文残留
    if (/[a-zA-Z]{4,}/.test(s)) return true;
    
    return false;
  };
  // 英文机构类型关键词 → 中文（用于对无法归类的机构生成基础中文翻译）
  const TYPE_ZH_KW: Array<[RegExp, string]> = [
    [/\bCommittee\b/i, "委员会"], [/\bCommission\b/i, "委员会"],
    [/\bBoard\b/i, "理事会"], [/\bCouncil\b/i, "议会"],
    [/\bTribunal\b/i, "法庭"], [/\bMinistry\b/i, "部"],
    [/\bDepartment\b/i, "部门"], [/\bAuthority\b/i, "管理局"],
    [/\bAgency\b/i, "机构"], [/\bBureau\b/i, "局"],
    [/\bOffice\b/i, "办公室"], [/\bDivision\b/i, "司"],
    [/\bUniversity\b/i, "大学"], [/\bCollege\b/i, "学院"],
    [/\bInstitute\b/i, "研究所"], [/\bInstitution\b/i, "机构"],
    [/\bHospital\b/i, "医院"], [/\bFoundation\b/i, "基金会"],
    [/\bFund\b/i, "基金"], [/\bTrust\b/i, "信托"],
    [/\bAssociation\b/i, "协会"], [/\bFederation\b/i, "联合会"],
    [/\bUnion\b/i, "联盟"], [/\bSociety\b/i, "学会"],
    [/\bCooperative\b/i, "合作社"], [/\bCorporation\b/i, "公司"],
    [/\bCompany\b/i, "公司"], [/\bBank\b/i, "银行"],
    [/\bCenter\b/i, "中心"], [/\bCentre\b/i, "中心"],
    [/\bCourt\b/i, "法院"], [/\bParliament\b/i, "议会"],
    [/\bCongress\b/i, "国会"], [/\bEmbassy\b/i, "大使馆"],
    [/\bConsulate\b/i, "领事馆"], [/\bPolice\b/i, "警察"],
    [/\bInspectorate\b/i, "监察"], [/\bRegulatory\b/i, "监管"],
    [/\bElectoral\b/i, "选举"], [/\bWater\b/i, "水务"],
    [/\bElectricity\b/i, "电力"], [/\bEnergy\b/i, "能源"],
    [/\bRoads\b/i, "道路"], [/\bHighway\b/i, "公路"],
    [/\bNGO\b/i, "非政府组织"], [/\bNetwork\b/i, "网络"],
    [/\bProgramme\b/i, "项目"], [/\bProgram\b/i, "项目"],
  ];
  /** 从英文机构名提取类型关键词生成基础中文翻译 */
  const buildZhFromKeywords = (name: string): string | null => {
    for (const [re, zh] of TYPE_ZH_KW) {
      if (re.test(name)) return zh;
    }
    return null;
  };

  // 国家名关键词（大写）→ 中文名（用于从机构名中提取国家信息）
  // 覆盖常见国家名在机构名中的出现形式
  const COUNTRY_NAME_KW: Record<string, string> = {
    "AFGHANISTAN": "阿富汗", "ALBANIA": "阿尔巴尼亚", "ALGERIA": "阿尔及利亚",
    "ANGOLA": "安哥拉", "ARGENTINA": "阿根廷", "ARMENIA": "亚美尼亚",
    "AUSTRALIA": "澳大利亚", "AUSTRIA": "奥地利", "AZERBAIJAN": "阿塞拜疆",
    "BANGLADESH": "孟加拉国", "BELARUS": "白俄罗斯", "BELGIUM": "比利时",
    "BENIN": "贝宁", "BOLIVIA": "玻利维亚", "BOTSWANA": "博茨瓦纳",
    "BRAZIL": "巴西", "BRASIL": "巴西",
    "BURKINA FASO": "布基纳法索", "BURUNDI": "布隆迪", "CAMBODIA": "柬埔寨",
    "CAMEROON": "喀麦隆", "CANADA": "加拿大", "CHAD": "乍得",
    "CHILE": "智利", "CHINA": "中国", "COLOMBIA": "哥伦比亚",
    "CONGO": "刚果", "CROATIA": "克罗地亚", "CUBA": "古巴",
    "CYPRUS": "塞浦路斯", "CZECH": "捷克", "DENMARK": "丹麦",
    "DJIBOUTI": "吉布提", "ECUADOR": "厄瓜多尔", "EGYPT": "埃及",
    "ETHIOPIA": "埃塞俄比亚", "FIJI": "斐济", "FINLAND": "芬兰",
    "FRANCE": "法国", "GABON": "加蓬", "GEORGIA": "格鲁吉亚",
    "GERMANY": "德国", "DEUTSCH": "德国",
    "GHANA": "加纳", "GREECE": "希腊", "GUATEMALA": "危地马拉",
    "GUINEA": "几内亚", "GUYANA": "圭亚那", "HAITI": "海地",
    "HONDURAS": "洪都拉斯", "HUNGARY": "匈牙利", "INDIA": "印度",
    "INDONESIA": "印度尼西亚", "IRAN": "伊朗", "IRAQ": "伊拉克",
    "ISRAEL": "以色列", "ITALY": "意大利", "JAMAICA": "牙买加",
    "JAPAN": "日本", "JORDAN": "约旦", "KAZAKHSTAN": "哈萨克斯坦",
    "KENYA": "肯尼亚", "KOREA": "韩国", "KUWAIT": "科威特",
    "KYRGYZSTAN": "吉尔吉斯斯坦", "LAOS": "老挝", "LATVIA": "拉脱维亚",
    "LEBANON": "黎巴嫩", "LESOTHO": "莱索托", "LIBERIA": "利比里亚",
    "LIBYA": "利比亚", "LITHUANIA": "立陶宛", "MADAGASCAR": "马达加斯加",
    "MALAWI": "马拉维", "MALAYSIA": "马来西亚", "MALI": "马里",
    "MAURITANIA": "毛里塔尼亚", "MAURITIUS": "毛里求斯", "MEXICO": "墨西哥",
    "MOLDOVA": "摩尔多瓦", "MONGOLIA": "蒙古", "MONTENEGRO": "黑山",
    "MOROCCO": "摩洛哥", "MOZAMBIQUE": "莫桑比克", "MYANMAR": "缅甸",
    "BURMA": "缅甸",
    "NAMIBIA": "纳米比亚", "NEPAL": "尼泊尔", "NETHERLANDS": "荷兰",
    "HOLLAND": "荷兰",
    "NEW ZEALAND": "新西兰", "NICARAGUA": "尼加拉瓜", "NIGER": "尼日尔",
    "NIGERIA": "尼日利亚", "NORWAY": "挪威", "OMAN": "阿曼",
    "PAKISTAN": "巴基斯坦", "PANAMA": "巴拿马", "PARAGUAY": "巴拉圭",
    "PERU": "秘鲁", "PHILIPPINES": "菲律宾", "POLAND": "波兰",
    "PORTUGAL": "葡萄牙", "QATAR": "卡塔尔", "ROMANIA": "罗马尼亚",
    "RUSSIA": "俄罗斯", "RUSSIAN": "俄罗斯",
    "RWANDA": "卢旺达", "SAUDI": "沙特", "SENEGAL": "塞内加尔",
    "SERBIA": "塞尔维亚", "SIERRA LEONE": "塞拉利昂", "SINGAPORE": "新加坡",
    "SLOVAKIA": "斯洛伐克", "SLOVENIA": "斯洛文尼亚", "SOMALIA": "索马里",
    "SOUTH AFRICA": "南非", "SPAIN": "西班牙", "SRI LANKA": "斯里兰卡",
    "SUDAN": "苏丹", "SURINAME": "苏里南", "SWEDEN": "瑞典",
    "SWITZERLAND": "瑞士", "SYRIA": "叙利亚", "TAJIKISTAN": "塔吉克斯坦",
    "TANZANIA": "坦桑尼亚", "THAILAND": "泰国", "TOGO": "多哥",
    "TUNISIA": "突尼斯", "TURKEY": "土耳其", "TURKIYE": "土耳其",
    "TURKMENISTAN": "土库曼斯坦", "UGANDA": "乌干达", "UKRAINE": "乌克兰",
    "URUGUAY": "乌拉圭", "UZBEKISTAN": "乌兹别克斯坦", "VENEZUELA": "委内瑞拉",
    "VIETNAM": "越南", "YEMEN": "也门", "ZAMBIA": "赞比亚",
    "ZIMBABWE": "津巴布韦",
    // 地区性关键词
    "AFRICAN": "非洲", "EUROPEAN": "欧洲", "ASIAN": "亚洲",
  };

  /** 从机构名中提取国家中文名（尝试多种策略） */
  const extractCountryFromName = (name: string): string | null => {
    const upper = name.toUpperCase();
    // 策略 1: 匹配国家名关键词（按长度降序，避免短词误匹配）
    const sortedKeywords = Object.entries(COUNTRY_NAME_KW)
      .sort((a, b) => b[0].length - a[0].length);
    for (const [kw, zh] of sortedKeywords) {
      // 使用词边界匹配，避免部分匹配（如 "INDIA" 不应匹配 "INDIANA"）
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(upper)) return zh;
    }
    // 策略 2: 匹配 ISO 代码后缀（如 _pk, _tr, _hu, _nz）
    // 支持多种格式：xxx_NZ, xxx_NZ_, xxx.gov.nz
    const isoMatch = upper.match(/[_\.]([A-Z]{2})(?:[_\.]|$)/);
    if (isoMatch) {
      const isoCode = isoMatch[1];
      const countryZh = COUNTRY_ZH[isoCode];
      if (countryZh) return countryZh;
    }
    // 策略 3: 匹配 gov.xx 形式的域名后缀（如 gov.pk, gov.tr, gov.qa）
    const govMatch = upper.match(/GOV[._]([A-Z]{2})(?:[._]|$)/);
    if (govMatch) {
      const tld = govMatch[1];
      const countryZh = COUNTRY_ZH[tld];
      if (countryZh) return countryZh;
    }
    return null;
  };

  /** 综合解析国家中文名（多策略尝试） */
  const resolveCountryZh = (key: string, item: AgencyCacheItem): string | null => {
    // 策略 1: 从 canonicalToCountry 获取
    let country = canonicalToCountry.get(key.toUpperCase()) || "";
    if (country) {
      const zh = COUNTRY_ZH[country];
      if (zh) return zh;
    }
    // 策略 2: 从 ORPHAN_ 前缀提取
    if (key.startsWith("ORPHAN_")) {
      const extracted = key.slice(7);
      if (extracted !== "OTHER") {
        const zh = COUNTRY_ZH[extracted];
        if (zh) return zh;
      }
    }
    // 策略 3: 从 originalAgencies 反查
    if (item.originalAgencies?.length) {
      for (const orig of item.originalAgencies) {
        const c = canonicalToCountry.get(orig.toUpperCase());
        if (c) {
          const zh = COUNTRY_ZH[c];
          if (zh) return zh;
        }
      }
    }
    // 策略 4: 从机构名中提取国家关键词
    const nameZh = extractCountryFromName(item.agency);
    if (nameZh) return nameZh;
    // 策略 5: 从 originalAgencies 的名称中提取
    if (item.originalAgencies?.length) {
      for (const orig of item.originalAgencies) {
        const zh = extractCountryFromName(orig);
        if (zh) return zh;
      }
    }
    return null;
  };

  for (const [key, item] of finalAggregated) {
    const zh = item.i18n?.zh;
    const needsFix = needsTranslationFix(zh, item.agency);
    if (!needsFix) continue;

    const countryZh = resolveCountryZh(key, item);
    if (countryZh) {
      // 有国家名 → 优先用类型关键词，否则用"各机构"
      const typeZh = buildZhFromKeywords(item.agency);
      item.i18n = { ...item.i18n, zh: typeZh ? `${countryZh}${typeZh}` : `${countryZh}各机构` };
    } else {
      // 无国家信息 → 尝试从英文关键词生成基础中文
      const typeZh = buildZhFromKeywords(item.agency);
      if (typeZh) {
        item.i18n = { ...item.i18n, zh: typeZh };
      } else {
        // 最终兜底：尝试生成更有意义的中文翻译
        const agencyName = item.agency;
        
        // 检测是否为系统代码（包含 _ 或 .，如 ppra_gov_pk, ashghal_gov_qa）
        if (/[_\.]/.test(agencyName)) {
          // 提取代码的第一部分作为标识
          const codePart = agencyName.split(/[_\.]/)[0];
          // 尝试翻译代码部分
          const codeTypeZh = buildZhFromKeywords(codePart);
          if (codeTypeZh) {
            item.i18n = { ...item.i18n, zh: `${codeTypeZh}（采购系统）` };
          } else {
            // 无法识别类型，使用通用翻译
            item.i18n = { ...item.i18n, zh: "政府采购系统" };
          }
        } 
        // 检测是否为非英文语言（如葡萄牙语、西班牙语等）
        else if (/\b(DE|DA|DO|DOS|DAS|LA|EL|LES|DES|DU|ET|AL|Y|E)\b/i.test(agencyName)) {
          // 包含罗曼语系介词，可能是葡萄牙语/西班牙语/法语等
          const typeZh = buildZhFromKeywords(agencyName);
          if (typeZh) {
            item.i18n = { ...item.i18n, zh: typeZh };
          } else {
            // 检测是否为法院/司法机构
            if (/\b(FEDERAL|JUDICIAL|COURT|TRIBUNAL|JUSTIÇA|JUSTICIA)\b/i.test(agencyName)) {
              item.i18n = { ...item.i18n, zh: "司法机构" };
            } else {
              item.i18n = { ...item.i18n, zh: "政府机构" };
            }
          }
        } 
        else {
          // 纯英文机构名，使用通用翻译
          item.i18n = { ...item.i18n, zh: "政府机构" };
        }
      }
    }
  }

  // 4) 按合并后计数降序排列，返回全量数据（不再截断）
  const data = Array.from(finalAggregated.values())
    .sort((a, b) => b.count - a.count);
  noticeAgenciesCache = { data, timestamp: Date.now() };
  return data;
}

// P2-5 修复：机构缓存刷新 Promise 去重——并发请求共享同一个刷新 Promise，避免重复查询
let _pendingAgenciesRefresh: Promise<AgencyCacheItem[]> | null = null;

/** 读取机构缓存，按 locale 解析翻译名（启动预热后始终有数据，未预热时惰性加载兜底） */
export async function getNoticeAgencies(
  pool: Pool,
  locale?: string,
): Promise<Array<{ agency: string; count: number; agency_i18n?: string }>> {
  // BUG 修复：检查 TTL 过期——缓存超过 10 分钟视为过期，重新计算
  const cacheValid = noticeAgenciesCache && Date.now() - noticeAgenciesCache.timestamp < AGENCIES_CACHE_TTL;
  let items: AgencyCacheItem[];
  if (cacheValid) {
    items = noticeAgenciesCache!.data;
  } else {
    // P2-5: 复用已有的刷新 Promise，避免并发重复执行
    if (!_pendingAgenciesRefresh) {
      _pendingAgenciesRefresh = refreshNoticeAgencies(pool).finally(() => {
        _pendingAgenciesRefresh = null;
      });
    }
    items = await _pendingAgenciesRefresh;
  }
  // en 直接用 canonical（即英文），其余语言附加翻译（含 zh）
  const lang = locale?.toLowerCase();
  if (!lang || lang === "en") {
    return items.map(({ agency, count }) => ({ agency, count }));
  }
  return items.map(({ agency, count, i18n }) => {
    const translated = i18n?.[lang];
    // BUG 修复：过滤无效翻译——翻译结果与英文机构名完全相同时不返回（说明是兜底而非真正翻译）
    // 典型场景：translateByPattern 兜底 { zh: "SOME AGENCY" } === agency "SOME AGENCY"
    const isValidTranslation = translated && translated !== agency;
    return isValidTranslation ? { agency, count, agency_i18n: translated } : { agency, count };
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

/**
 * 测试辅助：清除所有模块级缓存（搜索结果/计数/精选/国家/机构/统计/类型）
 * 仅在测试环境中使用，避免跨用例缓存污染
 */
export function __testClearAllCaches(): void {
  noticeSearchCache.clear();
  noticeCountCache.clear();
  featuredCountCache.total = 0;
  featuredCountCache.expires = 0;
  noticeCountriesCache = null;
  noticeAgenciesCache = null;
  noticeStatsCache = null;
  _noticeTypeCache = null;
}
