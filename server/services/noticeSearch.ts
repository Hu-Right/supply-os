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
import type { NoticesRepo } from "../repos/notices.repo";
import { getTranslatedNoticeDetail } from "./notice-translation";

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

/** 根据搜索参数生成统计表 key；无法映射时返回 null（回退到 COUNT 查询） */
function statsKeyFor(p: NoticeSearchParams): string | null {
  // 仅支持无关键词 + 无复杂筛选的场景
  if (p.q) return null; // 关键词搜索无法预计算
  if (p.codeId) return null; // UNSPSC 筛选无法预计算
  if (p.deadlineFrom || p.deadlineTo || p.deadlineWithinDays) return null; // 日期筛选无法预计算
  if (p.noticeType) return null; // 采购类型筛选无法预计算
  if (p.sort) return null; // 排序不影响总数，但为简化不纳入
  if (p.country && p.agency) return null; // 双条件组合暂不预计算
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

/** 回填/刷新 is_active 列——将过期或已过截止日期的公告标记为 inactive */
export async function refreshIsActive(pool: Pool): Promise<{ marked: number; unmarked: number }> {
  try {
    const t0 = Date.now();
    // 将已过期或已过截止日期的公告标记为 inactive
    const [deactivateResult] = await pool.query(
      `UPDATE crm_bid_notices SET is_active = 0
       WHERE is_active = 1
         AND (is_expired = 1 OR (deadline_ts IS NOT NULL AND deadline_sec < UNIX_TIMESTAMP(NOW())))`
    );
    const marked = (deactivateResult as any)?.affectedRows || 0;

    // 将重新变为活跃的公告恢复（极少发生，仅当 is_expired 被重置或 deadline 被延长时）
    const [reactivateResult] = await pool.query(
      `UPDATE crm_bid_notices SET is_active = 1
       WHERE is_active = 0
         AND (is_expired = 0 OR is_expired IS NULL)
         AND (deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))`
    );
    const unmarked = (reactivateResult as any)?.affectedRows || 0;

    console.log(`[is-active] is_active 刷新完成: ${Date.now() - t0}ms (deactivated=${marked}, reactivated=${unmarked})`);
    return { marked, unmarked };
  } catch (e) {
    console.error("[is-active] is_active 刷新失败（静默降级）:", (e as Error).message);
    return { marked: 0, unmarked: 0 };
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

  const where: string[] = ["n.is_active = 1"];
  const params: any[] = [];
  // 翻译搜索条件独立构建——IN(子查询) 方案下仅子查询引用翻译表别名
  const translationWhere: string[] = [];
  const translationWhereParams: any[] = [];
  let join = "";
  let idFilterSql = "";
  const idFilterParams: any[] = [];

  if (p.codeId) {
    const filter = await buildNoticeUnspscFilter(pool, p.codeId);
    idFilterSql = filter.sql;
    idFilterParams.push(...filter.params);
  }

  const compactQ = q.replace(/\s+/g, "").toUpperCase();
  const likeQ = `%${q}%`;
  if (q) {
    join += " LEFT JOIN crm_notice_translations qzh ON qzh.notice_id = n.id AND qzh.lang = 'zh'";
    join += " LEFT JOIN crm_notice_translations qen ON qen.notice_id = n.id AND qen.lang = 'en'";
    // 关键词搜索：基础条件不再纳入外层 WHERE——由 IN(子查询) 统一处理全部关键字匹配（基础+翻译 OR）
    // 翻译搜索条件独立存放——IN(子查询) 时下推到子查询内
    translationWhere.push(
      "(UPPER(REPLACE(COALESCE(sn.reference,''),' ','')) = ? OR sn.title LIKE ? OR sn.reference LIKE ? OR sn.description LIKE ? OR qzh.title_tr LIKE ? OR qzh.description_tr LIKE ? OR qen.title_tr LIKE ? OR qen.description_tr LIKE ?)"
    );
    translationWhereParams.push(compactQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
  }
  if (country) {
    // 精确匹配：国家值来自下拉（GROUP BY n.country 的精确值），LIKE 会误命中
    // 包含关系的国家（Guinea→Equatorial Guinea/Guinea-Bissau、Sudan→South Sudan 等）
    where.push("n.country = ?");
    params.push(country);
  }
  if (agency) {
    // 精确匹配：机构值来自下拉（GROUP BY n.agency 的精确值）
    where.push("n.agency = ?");
    params.push(agency);
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
  // COUNT 专用 JOIN：仅包含影响 WHERE 条件的 JOIN（翻译/描述对计数无贡献）
  // 修复：关键词搜索时 countJoin 不含 idFilterSql（已在 IN(子查询) 内），避免外层重复过滤
  let countJoin = q ? "" : idFilterSql;
  if (q) {
    countJoin += " LEFT JOIN crm_notice_translations qzh ON qzh.notice_id = n.id AND qzh.lang = 'zh'";
    countJoin += " LEFT JOIN crm_notice_translations qen ON qen.notice_id = n.id AND qen.lang = 'en'";
  }

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
  const translationWhereSql = translationWhere.join(" AND ");
  // COUNT 查询：关键词匹配已移入 IN(子查询)，COUNT 也需使用 IN(子查询) 保持一致
  // 修复：UNSPSC 行业过滤(idFilterSql)移至子查询内，与关键词搜索保持一致
  const countWhereSql = q && translationWhereSql
    ? `${whereSql} AND n.id IN (SELECT sn.id FROM crm_bid_notices sn ${idFilterSql} LEFT JOIN crm_notice_translations qzh ON qzh.notice_id = sn.id AND qzh.lang = 'zh' LEFT JOIN crm_notice_translations qen ON qen.notice_id = sn.id AND qen.lang = 'en' WHERE ${whereSql} AND ${translationWhereSql})`
    : whereSql;

  // P0 性能优化：COUNT 结果缓存——翻页及首次加载时复用，避免每次重新全量计数
  // 回滚：删除 noticeCountCache 相关代码，恢复原始 Promise.all 中始终执行 COUNT 即可
  const cKey = countCacheKey(p);
  const cachedCount = noticeCountCache.get(cKey);
  // 首次加载（page=1）也读缓存：countCacheKey 不含 locale，不同语言共享同一 total
  const useCachedCount = cachedCount && cachedCount.expires > Date.now();

  // P1 性能优化：精选计数独立缓存——精选总数变化极低频，跳过昂贵的双路 IN 子查询
  // 回滚：删除 featuredCountCache 分支，统一走通用 COUNT 缓存
  const useFeaturedCache = featuredOnly && featuredCountCache.expires > Date.now();

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

  /** 执行 COUNT(DISTINCT) 查询并写入缓存 */
  function runCountQuery(): Promise<any> {
    const countExpr = "COUNT(DISTINCT n.id)";
    // 修复：关键词搜索时外层 WHERE 不含 idFilterParams（idFilterSql 已在子查询内）
    const countParams = q && translationWhereSql
      ? [...params, ...idFilterParams, ...params, ...translationWhereParams]
      : [...idFilterParams, ...params, ...translationWhereParams];
    return pool.query(
      `SELECT ${countExpr} AS total FROM crm_bid_notices n ${countJoin} WHERE ${countWhereSql}`,
      countParams
    ).then((result: any) => {
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

  // P4 性能优化：两阶段查询——阶段 1 轻量 ID 分页，阶段 2 按 ID 批量获取详情
  // 修复：关键词搜索时使用 IN(子查询) 替代 DISTINCT——
  // MySQL ONLY_FULL_GROUP_BY 要求 SELECT DISTINCT 时 ORDER BY 列必须在 SELECT 列表中，
  // 而排序列 n.reference / n.deadline_sec 不在 SELECT DISTINCT n.id 中，导致报错。
  // IN(子查询) 方案：翻译 JOIN 下推到子查询内，外层无 DISTINCT，ORDER BY 不受限制。
  let countMs = 0;
  const countTimed = countPromise.then((r: any) => { countMs = Date.now() - t0; return r; });
  let idMs = 0;
  const idQueryStart = Date.now();
  const idTimed = (q
    ? // 关键词搜索：全部匹配条件（基础+翻译 OR + UNSPSC 行业过滤）在子查询内完成，外层仅按 ID 过滤
      pool.query(
        `SELECT n.id FROM crm_bid_notices n
         WHERE ${whereSql}
           AND n.id IN (
             SELECT sn.id FROM crm_bid_notices sn ${idFilterSql}
             LEFT JOIN crm_notice_translations qzh ON qzh.notice_id = sn.id AND qzh.lang = 'zh'
             LEFT JOIN crm_notice_translations qen ON qen.notice_id = sn.id AND qen.lang = 'en'
             WHERE ${whereSql}
               AND (${translationWhereSql})
           )
         ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
        [
          ...params,                                                        // 外层 WHERE（基础条件，无关键字）
          ...idFilterParams, ...params, ...translationWhereParams,           // 子查询 WHERE + 关键字(基础+翻译 OR) + UNSPSC 行业过滤
          ...orderParams, pageSize, offset,
        ]
      )
    : // 无关键词搜索：无翻译 JOIN，无重复行，直接查询
      pool.query(
        `SELECT n.id FROM crm_bid_notices n ${countJoin} WHERE ${whereSql}
         ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
        [...idFilterParams, ...params, ...orderParams, pageSize, offset]
      )
  ).then((r: any) => { idMs = Date.now() - idQueryStart; return r; });

  const [countResult, idResult] = await Promise.all([countTimed, idTimed]);

  const t1 = Date.now();
  const [countRows] = countResult;
  const [idRows] = idResult;
  const total = Number((countRows as RowDataPacket[])[0]?.total || 0);
  const pageIds = (idRows as RowDataPacket[]).map((row) => Number(row.id)).filter(Boolean);

  // 阶段 2：按 ID 批量获取详情（含翻译 JOIN，无 DISTINCT 风险，仅查 ≤pageSize 条）
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
  console.log(`[search-perf] page=${page} q="${q}" country="${country}" featured=${featuredOnly}` +
    ` | COUNT=${countMs}ms | IDs=${idMs}ms | Phase1=${t1 - t0}ms | Phase2=${t2 - t1}ms | Phase3=${t3 - t2}ms | TOTAL=${t3 - t0}ms`);

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
     WHERE n.is_active = 1 AND n.country IS NOT NULL AND n.country <> ''
     GROUP BY n.country ORDER BY cnt DESC`
  );
  const data = (rows as RowDataPacket[]).map((row) => ({ country: row.country, count: Number(row.cnt) }));
  noticeCountriesCache = { data, expires: Date.now() + 10 * 60 * 1000 };
  return data;
}

// ── 采购机构下拉数据源（按公告数降序，服务端缓存 10 分钟）──
let noticeAgenciesCache: { data: Array<{ agency: string; count: number }>; expires: number } | null = null;

export async function getNoticeAgencies(pool: Pool): Promise<Array<{ agency: string; count: number }>> {
  if (noticeAgenciesCache && noticeAgenciesCache.expires > Date.now()) return noticeAgenciesCache.data;
  const [rows] = await pool.query(
    `SELECT n.agency, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE n.is_active = 1 AND n.agency IS NOT NULL AND n.agency <> ''
     GROUP BY n.agency ORDER BY cnt DESC`
  );
  const data = (rows as RowDataPacket[]).map((row) => ({ agency: row.agency, count: Number(row.cnt) }));
  noticeAgenciesCache = { data, expires: Date.now() + 10 * 60 * 1000 };
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
