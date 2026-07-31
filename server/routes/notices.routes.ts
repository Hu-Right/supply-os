/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeDocumentRows, normalizeUserKey } from "../utils/normalize";
import { normalizeUnspscCodes, buildNoticeUnspscFilter, persistUserInterestCodes } from "../services/unspsc";
import { decayUserInterestCodes, recomputeRecoWeightProfile, recoVariant, tokenizeNoticeText, jaccardTokenSim, S_TEXT_BONUS, getUserUnlockKeywords } from "../services/recommend";
import { normalizeNoticeDetailPayload, findQualifiedOpportunityForNotice } from "../services/notices";
import { backfillNoticeAmountCache } from "../services/amount";
import { NOTICE_TRANSLATION_LANGS, pendingNoticeTranslations, translateNoticeViaChain } from "../services/notice-translation";

export function createNoticesRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  // ── F.4 搜索性能预案第一档（本地差异 #7）──
  // 搜索实测 1.2~1.9 秒/次（10.8 万行五列 LIKE 全扫，G.8 勘误 3），对同条件重复搜索
  // 做 60 秒进程内缓存：卡片群发后多客户抄同一编号来搜属高频场景，命中即毫秒级返回。
  // 缓存命中仍照常异步落库（G.4），运营统计不失真
  const noticeSearchCache = new Map<string, { payload: any; total: number; expires: number }>();
  const NOTICE_SEARCH_CACHE_TTL = 60 * 1000;
  const NOTICE_SEARCH_CACHE_MAX = 200;

  // ── 精选池标注缓存（T-A3，本地差异 #14：A.2）──
  // [精选功能临时禁用 2026-07-29] id 集合缓存与加载函数整体注释停用（非删除，保留以便重新启用）
  // active 精选 id 全集（约 3.2k）10 分钟进程内缓存：当页 is_featured 批量标注 O(1)，
  // 避免每次列表请求都跑三路物化子查询（冷加载约 2s，10 分钟一次）
  // let featuredIdsCache: { ids: Set<number>; expires: number } | null = null;
  // const getFeaturedIdSet = async (): Promise<Set<number>> => {
  //   if (featuredIdsCache && featuredIdsCache.expires > Date.now()) return featuredIdsCache.ids;
  //   const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
  //   const [rows] = await dbPool.query(
  //     `SELECT n.id FROM crm_bid_notices n
  //      WHERE (n.is_expired = 0 OR n.is_expired IS NULL)
  //        AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))
  //        AND ${FEATURED_NOTICE_EXISTS}`
  //   );
  //   const ids = new Set<number>((rows as any[]).map((row) => Number(row.id)));
  //   featuredIdsCache = { ids, expires: Date.now() + 10 * 60 * 1000 };
  //   return ids;
  // };

  router.get("/api/notices", async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(30, Math.max(6, Number(req.query.page_size || 9)));
      const offset = (page - 1) * pageSize;
      const codeId = Number(req.query.code_id || req.query.industry_id || 0);
      // ── 公采搜索功能（本地差异 #6：G.2 四参数 q/country/deadline_from/deadline_to/sort）──
      const q = String(req.query.q || "").trim().slice(0, 200);
      const country = String(req.query.country || "").trim().slice(0, 100);
      const deadlineFrom = String(req.query.deadline_from || "").trim();
      const deadlineTo = String(req.query.deadline_to || "").trim();
      const sort = String(req.query.sort || "deadline");
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      // ── 本地差异 #13：T-B8 多维过滤缺口参数（B.3.3）──
      // value_min/value_max 单位 USD（走 T-B3 自有缓存表 amount_usd，跨币种可比）；
      // deadline_within_days 1~365；notice_type 自由文本 LIKE 宽匹配（与 country 同口径）
      const valueMin = Number.isFinite(Number(req.query.value_min)) && Number(req.query.value_min) > 0
        ? Number(req.query.value_min) : 0;
      const valueMax = Number.isFinite(Number(req.query.value_max)) && Number(req.query.value_max) > 0
        ? Number(req.query.value_max) : 0;
      const deadlineWithinDays = Number.isInteger(Number(req.query.deadline_within_days))
        ? Math.min(365, Math.max(0, Number(req.query.deadline_within_days))) : 0;
      const noticeType = String(req.query.notice_type || "").trim().slice(0, 100);
      // T-A3（本地差异 #14）：只看精选开关（三路合格机会判定，T-A1 单一事实源）
      // [精选功能临时禁用 2026-07-29] 原解析注释停用，featured 参数被忽略；恢复时还原下行并删除 stub
      // const featuredOnly = String(req.query.featured || "") === "1";
      const featuredOnly = false; // 禁用期间恒 false，保持下游 hasSearch/cacheKey/filters 引用编译通过

      // ── 搜索行为落库（本地差异 #6：G.4）──
      // 仅带搜索/筛选条件时记录；user_key 经 normalizeUserKey（F.1），游客落 NULL；
      // country 供 D.2 显式地区偏好，result_cnt=0 即"搜而无果"供运营反哺；异步不阻塞响应
      const hasSearch = Boolean(
        q || country || dateRe.test(deadlineFrom) || dateRe.test(deadlineTo) ||
        valueMin || valueMax || deadlineWithinDays || noticeType || // T-B8：新参数同样计入搜索条件
        featuredOnly // T-A3：只看精选走慢路径缓存
      );
      const logSearch = (total: number) => {
        if (!hasSearch) return;
        const filters = JSON.stringify({
          code_id: codeId || undefined,
          deadline_from: dateRe.test(deadlineFrom) ? deadlineFrom : undefined,
          deadline_to: dateRe.test(deadlineTo) ? deadlineTo : undefined,
          value_min: valueMin || undefined,
          value_max: valueMax || undefined,
          deadline_within_days: deadlineWithinDays || undefined,
          notice_type: noticeType || undefined,
          featured: featuredOnly || undefined,
          sort,
        });
        void dbPool
          .execute(
            "INSERT INTO crm_user_search_log (user_key, q, country, filters, result_cnt) VALUES (?, ?, ?, ?, ?)",
            [normalizeUserKey(req.query.user_key), q || null, country || null, filters, total]
          )
          .catch(() => undefined);
      };

      // F.4 缓存命中（本地差异 #7）：仅带搜索条件的查询走缓存（慢路径），命中仍落库
      const cacheKey = hasSearch
        ? JSON.stringify([page, pageSize, codeId, q, country, deadlineFrom, deadlineTo, sort,
            valueMin, valueMax, deadlineWithinDays, noticeType, featuredOnly]) // T-B8/T-A3：缓存 key 覆盖新参数
        : "";
      if (cacheKey) {
        const cached = noticeSearchCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
          res.json(cached.payload);
          logSearch(cached.total);
          return;
        }
      }

      const where: string[] = ["(n.is_expired = 0 OR n.is_expired IS NULL)"];
      const params: any[] = [];
      let join = "";
      let idFilterSql = "";
      const idFilterParams: any[] = [];

      // F.3 deadline 查询兜底（本地差异 #6）：is_expired 有滞后（实测 542 行已过期未标），
      // 按 deadline_ts 再挡一道。deadline_ts 秒/毫秒混存（实测 4.3 万秒级 + 4.9 万毫秒级），
      // 比较/排序前统一折算成秒
      const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
      where.push(`(n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`);

      if (codeId) {
        const filter = await buildNoticeUnspscFilter(dbPool, codeId);
        idFilterSql = filter.sql;
        idFilterParams.push(...filter.params);
      }

      // q 三级匹配（G.2）：①编号精确（去空格忽略大小写，卡片招标编号↔reference，命中置顶）
      // ②原文模糊（title/reference/description）③中文译文缓存命中（客户抄卡片中文标题也能搜到）
      const compactQ = q.replace(/\s+/g, "").toUpperCase();
      if (q) {
        join += " LEFT JOIN crm_notice_translations qtr ON qtr.notice_id = n.id AND qtr.lang = 'zh'";
        const likeQ = `%${q}%`;
        where.push(
          "(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ? OR n.title LIKE ? OR n.reference LIKE ? OR n.description LIKE ? OR qtr.title_tr LIKE ?)"
        );
        params.push(compactQ, likeQ, likeQ, likeQ, likeQ);
      }
      if (country) {
        // country 列为自由文本（varchar(500)，可能含多国名），用 LIKE 宽匹配
        where.push("n.country LIKE ?");
        params.push(`%${country}%`);
      }
      if (dateRe.test(deadlineFrom)) {
        where.push(`${deadlineSecExpr} >= UNIX_TIMESTAMP(?)`);
        params.push(`${deadlineFrom} 00:00:00`);
      }
      if (dateRe.test(deadlineTo)) {
        where.push(`${deadlineSecExpr} <= UNIX_TIMESTAMP(?)`);
        params.push(`${deadlineTo} 23:59:59`);
      }
      // ── T-B8 新增过滤（本地差异 #13）──
      // deadline_within_days：截止在 N 天内（不含无截止；折算表达式，约束 9）
      if (deadlineWithinDays > 0) {
        where.push(`n.deadline_ts IS NOT NULL AND ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + ? * 86400`);
        params.push(deadlineWithinDays);
      }
      if (noticeType) {
        // notice_type 为自由文本（英文枚举/中文/混排），LIKE 宽匹配与前端 noticeTypeKey 归一互补
        where.push("n.notice_type LIKE ?");
        params.push(`%${noticeType}%`);
      }
      // value_min/value_max：JOIN T-B3 金额缓存表按 amount_usd 过滤（区间过滤=显式意图，
      // 未解析出金额的公告不进结果；缓存表覆盖率由懒填充+admin 回填保障）
      if (valueMin || valueMax) {
        join += " INNER JOIN crm_notice_amount_cache vamc ON vamc.notice_id = n.id AND vamc.amount_usd IS NOT NULL";
        if (valueMin) {
          where.push("vamc.amount_usd >= ?");
          params.push(valueMin);
        }
        if (valueMax) {
          where.push("vamc.amount_usd <= ?");
          params.push(valueMax);
        }
      }
      // T-A3（本地差异 #14）：只看精选——三路非相关 IN 物化（T-A1 常量，无逐行相关子查询）
      // [精选功能临时禁用 2026-07-29] featuredOnly 恒 false，过滤分支连同常量引用一并注释
      // if (featuredOnly) {
      //   where.push(FEATURED_NOTICE_EXISTS);
      // }

      // 排序：latest=最新收录优先（id 逆序；published_date 为自由文本不可靠）；
      // 默认 deadline=截止最近优先（折算秒后排序，修复秒/毫秒混存下的乱序）
      const orderParts: string[] = [];
      const orderParams: any[] = [];
      if (q) {
        orderParts.push("(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ?) DESC");
        orderParams.push(compactQ);
      }
      if (sort === "latest") {
        orderParts.push("n.id DESC");
      } else {
        orderParts.push("(n.deadline_ts IS NULL)", deadlineSecExpr, "n.id DESC");
      }
      const orderSql = orderParts.join(", ");

      const whereSql = where.join(" AND ");
      const [countRows] = await dbPool.query(
        `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n ${idFilterSql}${join} WHERE ${whereSql}`,
        [...idFilterParams, ...params]
      );
      const total = Number((countRows as any[])[0]?.total || 0);
      const [rows] = await dbPool.query(
        `SELECT DISTINCT
           n.id,
           n.notice_id,
           n.reference,
           n.title,
           n.notice_type,
           n.country,
           n.deadline,
           n.deadline_ts,
           n.estimated_value,
           n.description
         FROM crm_bid_notices n
         ${idFilterSql}${join}
         WHERE ${whereSql}
         ORDER BY ${orderSql}
         LIMIT ? OFFSET ?`,
        [...idFilterParams, ...params, ...orderParams, pageSize, offset]
      );

      // T-A3：当页 is_featured 批量标注（10 分钟 id 集合缓存，纯内存判定不逐行查库；
      // 标注失败不阻断列表——精选徽标缺失可接受，公告数据不能缺）
      // [精选功能临时禁用 2026-07-29] 标注停用，响应不再返回 is_featured（前端徽标已同步注释）
      // const featuredIds = await getFeaturedIdSet().catch(() => new Set<number>());

      // 本地差异 #19：锁定态拆解文件计数预览——按当页 id 批量取 documents/procurement_files，
      // 用 normalizeDocumentRows 归一去重后仅下发计数（不泄露文件名/链接，清单仍需解锁），
      // 供前端解锁前展示"包含拆解文件"指示器；计数失败不阻断列表（前端缺字段时回退中性提示）
      const pageIds = (rows as any[]).map((row) => Number(row.id)).filter(Boolean);
      const breakdownCounts = new Map<number, number>();
      if (pageIds.length > 0) {
        try {
          const [docRows] = await dbPool.query(
            `SELECT id, documents, procurement_files FROM crm_bid_notices WHERE id IN (${pageIds.map(() => "?").join(",")})`,
            pageIds
          );
          for (const docRow of docRows as any[]) {
            breakdownCounts.set(
              Number(docRow.id),
              normalizeDocumentRows(docRow.documents, docRow.procurement_files).length
            );
          }
        } catch {
          // 计数查询失败：静默降级，响应省略 breakdown_file_count 字段
        }
      }

      const payload = {
        items: (rows as any[]).map((row) => ({
          ...row,
          // is_featured: featuredOnly || featuredIds.has(Number(row.id)), // [精选功能临时禁用 2026-07-29]
          agency: null,
          organization: null,
          source_url: null,
          unspsc_codes: [],
          core_locked: true,
          // 本地差异 #19：仅计数；查询失败时 undefined 被 res.json 省略，前端回退中性提示
          breakdown_file_count: breakdownCounts.has(Number(row.id))
            ? breakdownCounts.get(Number(row.id))
            : undefined,
        })),
        total,
        page,
        pageSize,
      };
      res.json(payload);

      // F.4 写缓存（本地差异 #7）：60 秒 TTL；超上限先清过期项、仍超则整体清空防内存膨胀
      if (cacheKey) {
        if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) {
          const now = Date.now();
          for (const [key, entry] of noticeSearchCache) {
            if (entry.expires <= now) noticeSearchCache.delete(key);
          }
          if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) noticeSearchCache.clear();
        }
        noticeSearchCache.set(cacheKey, { payload, total, expires: Date.now() + NOTICE_SEARCH_CACHE_TTL });
      }

      logSearch(total);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── 公采搜索功能（本地差异 #6：G.3 国家下拉数据源）──
  // 在库有效公告的国家清单（按公告数降序）；10.8 万行扫描结果进程内缓存 10 分钟
  let noticeCountriesCache: { data: any[]; expires: number } | null = null;
  router.get("/api/notices/countries", async (_req, res) => {
    try {
      if (noticeCountriesCache && noticeCountriesCache.expires > Date.now()) {
        return res.json(noticeCountriesCache.data);
      }
      const [rows] = await dbPool.query(
        `SELECT n.country, COUNT(*) AS cnt
         FROM crm_bid_notices n
         WHERE (n.is_expired = 0 OR n.is_expired IS NULL)
           AND n.country IS NOT NULL AND n.country <> ''
         GROUP BY n.country
         ORDER BY cnt DESC
         LIMIT 100`
      );
      const data = (rows as any[]).map((row) => ({ country: row.country, count: Number(row.cnt) }));
      noticeCountriesCache = { data, expires: Date.now() + 10 * 60 * 1000 };
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── 公采池统计端点（T-A2，本地差异 #14：A.2）──
  // raw/active/bridged/featured/bridge_gap 五指标；各自独立简单查询（禁止合并巨型 SQL），
  // 结果进程内缓存 10 分钟（冷查询约 4s，缓存命中 <10ms）
  let noticeStatsCache: { data: any; expires: number } | null = null;
  router.get("/api/notices/stats", async (_req, res) => {
    try {
      if (noticeStatsCache && noticeStatsCache.expires > Date.now()) {
        return res.json(noticeStatsCache.data);
      }
      const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
      const activeWhere = `(n.is_expired = 0 OR n.is_expired IS NULL)
        AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`;

      const [rawRows] = await dbPool.query("SELECT COUNT(*) AS total FROM crm_bid_notices n");
      const [activeRows] = await dbPool.query(
        `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${activeWhere}`
      );
      // 已桥接 = 有效公告中在桥接表有 UNSPSC 码的（单路 EXISTS 可半连接优化，无 OR 退化问题）
      const [bridgedRows] = await dbPool.query(
        `SELECT COUNT(*) AS total FROM crm_bid_notices n
         WHERE ${activeWhere}
           AND EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id)`
      );
      // 精选 = 有效公告中命中三路合格机会判定的（T-A1 单一事实源）
      // [精选功能临时禁用 2026-07-29] featured 指标查询注释停用，下方以 0 占位保持 API 响应形状
      // const [featuredRows] = await dbPool.query(
      //   `SELECT COUNT(*) AS total FROM crm_bid_notices n
      //    WHERE ${activeWhere} AND ${FEATURED_NOTICE_EXISTS}`
      // );

      const active = Number((activeRows as any[])[0]?.total || 0);
      const bridged = Number((bridgedRows as any[])[0]?.total || 0);
      const data = {
        raw: Number((rawRows as any[])[0]?.total || 0),
        active,
        bridged,
        // featured: Number((featuredRows as any[])[0]?.total || 0), // [精选功能临时禁用 2026-07-29]
        featured: 0, // 禁用期间返回 0 占位
        bridge_gap: active - bridged,
      };
      noticeStatsCache = { data, expires: Date.now() + 10 * 60 * 1000 };
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/notices/unlocks", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || "guest"; // 本地差异 #7：F.1 归一化收敛（读侧保留 guest 兜底）
      const [rows] = await dbPool.query(
        "SELECT notice_id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id IS NOT NULL ORDER BY unlocked_at DESC",
        [userKey]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── [热度兜底临时禁用 2026-07-30] ──
  // 原 T-C1 热度兜底（hotFallbackCache + loadHotFallbackRows）已注释，
  // 游客/零兴趣码用户改为按 deadline 降序展示有效公告。
  // let hotFallbackCache: { rows: any[]; expires: number } | null = null;
  // const HOT_FALLBACK_TTL = 10 * 60 * 1000;
  // async function loadHotFallbackRows() { ... }

  router.get("/api/notices/recommended", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(30, Math.max(6, Number(req.query.page_size || 9)));
      const offset = (page - 1) * pageSize;
      // [热度兜底临时禁用 2026-07-30] 游客/零兴趣码走按截止日期降序的有效公告
      const respondDeadlineFallback = async () => {
        const dlSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
        const activeW = "(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR " + dlSecExpr + " >= UNIX_TIMESTAMP(NOW()))";
        const [[cntRow]] = await dbPool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${activeW}`) as any[];
        const [fallbackRows] = await dbPool.query(
          `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
                  n.deadline, n.deadline_ts, n.estimated_value, n.description,
                  n.documents, n.procurement_files
           FROM crm_bid_notices n WHERE ${activeW}
           ORDER BY ${dlSecExpr} DESC LIMIT ? OFFSET ?`, [pageSize, offset]);
        return res.json({
          items: (fallbackRows as any[]).map(row => ({
            ...row,
            match_score: 0,
            reco_score: 0,
            agency: null,
            organization: null,
            source_url: null,
            unspsc_codes: [],
            core_locked: true,
            breakdown_file_count: normalizeDocumentRows(row.documents, row.procurement_files).length,
            documents: undefined,
            procurement_files: undefined,
          })),
          total: Number((cntRow as any).total),
          page,
          pageSize,
          fallback: "deadline",
        });
      };
      if (!userKey) return respondDeadlineFallback(); // [热度兜底临时禁用] 游客走 deadline 降序

      // 本地差异 #10：T-E1 时间衰减进选码 SQL（E.1）。第四批的衰减发生在 LIMIT 80 之后（JS 层），
      // 选码环节仍被陈旧高权重码霸占——改为 SQL 内先衰减再排序取 top 80，JS 直接用 decayed_weight，
      // 不再二次衰减（避免双重衰减）。半衰期 90 天与原口径一致：0.5^(age/90) = EXP(-LN(2)*age/90)
      const [interestRows] = await dbPool.query(
        `SELECT code, level, MAX(code_id) AS code_id,
                SUM(weight * EXP(-LN(2) * GREATEST(0, DATEDIFF(NOW(), COALESCE(updated_at, created_at))) / 90)) AS decayed_weight,
                MAX(COALESCE(updated_at, created_at)) AS last_update
         FROM crm_user_interest_codes
         WHERE user_key = ?
         GROUP BY code, level
         ORDER BY decayed_weight DESC, last_update DESC
         LIMIT 80`,
        [userKey]
      );
      // ── B.2.2 UNSPSC 加权评分首期（本地差异 #9）──
      // depth_factor：层级越精确分越高（D.1 路线 2：分母取用户 top 兴趣理论满分，单遍 SQL 分页保留）
      // 命中判定用"显著前缀撞 b.code"（去尾零对：'80101500'→'801015'），MAX(LIKE) 保证每码每公告只计一次
      const DEPTH_FACTOR: Record<number, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 };
      const scoredCodes: Array<{ prefix: string; weighted: number }> = [];
      let interestTotal = 0; // 路线 2 分母：Σ 衰减后权重（depth_factor 上界 1.0 时的理论满分）
      const significantPrefix = (code: string) => {
        let s = code;
        while (s.length > 2 && s.length % 2 === 0 && s.endsWith("00")) s = s.slice(0, -2);
        return s;
      };
      // 召回：兴趣表 code_id 撞桥接表 levelN_id（两者同为 crm_unspsc_codes.id，有 idx_levelN 索引）。
      // 勘误（第四批实测）：旧逻辑把兴趣"码串"（如 '8010'）塞进 levelN_id IN(...)，而 levelN_id 存的是
      // crm_unspsc_codes.id（10 万段数字），仅靠数值巧合命中 40 个公告；改用 code_id 后同一用户命中 2625 个
      const recallIdsByLevel: Record<number, number[]> = { 2: [], 3: [], 4: [], 5: [] };
      const recallLikePrefixes = new Set<string>(); // code_id 缺失的兜底：前缀撞 b.code
      for (const row of interestRows as any[]) {
        const level = Math.min(5, Math.max(1, Number(row.level || 1)));
        const code = String(row.code || "").trim();
        if (!code) continue;
        const prefix = significantPrefix(code);
        // ── F.2 召回最低层级门槛（本地差异 #7）：仅 level2+ 参与召回，level1 只作评分加权 ──
        if (level >= 2) {
          const codeId = Number(row.code_id || 0);
          if (codeId > 0) recallIdsByLevel[level].push(codeId);
          else if (prefix.length >= 4) recallLikePrefixes.add(prefix);
        }
        // T-E1：直接用 SQL 已算好的衰减权重（选码/分母/评分同源，只衰减一次）
        const decayed = Number(row.decayed_weight || 0);
        if (decayed <= 0) continue;
        interestTotal += decayed;
        const depth = Math.min(4, Math.max(1, prefix.length / 2)); // 显著前缀长度定深度，8 位全码=1.0
        scoredCodes.push({ prefix, weighted: decayed * (DEPTH_FACTOR[depth] ?? 1.0) });
      }

      const clauses: string[] = [];
      const params: any[] = [];
      for (const level of [2, 3, 4, 5]) {
        const ids = Array.from(new Set(recallIdsByLevel[level]));
        if (ids.length === 0) continue;
        clauses.push(`b.level${level}_id IN (${ids.map(() => "?").join(",")})`);
        params.push(...ids);
      }
      for (const prefix of recallLikePrefixes) {
        clauses.push(`b.code LIKE ?`);
        params.push(`${prefix}%`);
      }

      if (clauses.length === 0) {
        return respondDeadlineFallback(); // [热度兜底临时禁用 2026-07-30] 零兴趣码走 deadline 降序
      }

      // F.3 deadline 兜底（本地差异 #7：补齐 recommended 两处 WHERE，与 /api/notices 同口径）
      // deadline_ts 秒/毫秒混存（G.8 勘误 1），比较/排序前统一折算成秒
      const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
      let activeWhere = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`;
      const extraParams: any[] = [];
      // [dismiss 功能临时禁用 2026-07-30] 前端已移除 dismiss 按钮，此过滤条件暂不启用
      // if (String(req.query.exclude_dismissed || "") === "1") {
      //   activeWhere += ` AND n.id NOT IN (
      //      SELECT notice_id FROM crm_user_reco_feedback
      //      WHERE user_key = ? AND action = 'dismiss' AND created_at >= NOW() - INTERVAL 30 DAY)`;
      //   extraParams.push(userKey);
      // }

      const bridgeWhere = clauses.map((clause) => `(${clause})`).join(" OR ");
      const [countRows] = await dbPool.query(
        `SELECT COUNT(DISTINCT n.id) AS total
         FROM crm_bid_notices n
         INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.id
         WHERE (${bridgeWhere}) AND ${activeWhere}`,
        [...params, ...extraParams]
      );

      // reco_score = w_unspsc·s_unspsc + w_urgency·s_urgency + w_amount·s_amount + 中性常数
      //（s_agency/s_geo 中性 0.5：地域/机构数据未积累，B 章后续批次补齐）。
      // 本地差异 #15：T-B7——权重从 per-user 档案读取（缺行/异常值走全局默认
      // 0.5/0.15/0.10/0.10/0.15，与第四批硬编码行为恒等）；档案缺失或超 24h 时
      // fire-and-forget 异步重算，绝不阻塞本次推荐响应（无定时器，约束 6）。
      // 本地差异 #10：s_amount 从常数拆出（D.3.2 落地）——
      // JOIN 自有缓存表 crm_notice_amount_cache，对数距离衰减，inferred 向中性收缩 ×0.7，缺失 0.5
      // 本地差异 #15：T-B10——A/B 分桶门控：treatment 桶才启用 per-user 档案权重，
      // control 桶恒走全局默认（放量 0 时全员 control，行为与 T-B7 上线前恒等）；
      // 档案懒刷新两桶都做（数据积累不受门控影响，放量时 treatment 立即有档案可用）
      const variant = recoVariant(userKey);
      const [profileRows] = await dbPool.query(
        `SELECT w_unspsc, w_agency, w_amount, w_geo, w_urgency, updated_at
         FROM crm_reco_weight_profile WHERE user_key = ? LIMIT 1`,
        [userKey]
      );
      const profileRow = (profileRows as any[])[0] || null;
      const profile = variant === "treatment" ? profileRow : null;
      const pickWeight = (value: any, fallback: number) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
      };
      const wUnspsc = pickWeight(profile?.w_unspsc, 0.5);
      const wUrgency = pickWeight(profile?.w_urgency, 0.15);
      const wAmount = pickWeight(profile?.w_amount, 0.1);
      // s_agency/s_geo 未接入前恒中性 0.5，两档权重折成常数项（默认 0.15·0.5 + 0.10·0.5 = 0.125）
      const wNeutral = (pickWeight(profile?.w_agency, 0.15) + pickWeight(profile?.w_geo, 0.1)) * 0.5;
      const profileStale =
        !profileRow || !profileRow.updated_at ||
        Date.now() - new Date(profileRow.updated_at).getTime() > 24 * 3600 * 1000;
      if (profileStale) void recomputeRecoWeightProfile(dbPool, userKey).catch(() => undefined);
      const scoreParams: any[] = [];
      const matchWeightExpr = scoredCodes.length
        ? `(${scoredCodes.map(() => "MAX(b.code LIKE ?) * ?").join(" + ")})`
        : "0";
      for (const item of scoredCodes) scoreParams.push(`${item.prefix}%`, item.weighted);
      const denominator = interestTotal > 0 ? interestTotal : 1;
      const urgencyExpr = `CASE
           WHEN n.deadline_ts IS NULL THEN 0.5
           WHEN ${deadlineSecExpr} < UNIX_TIMESTAMP(NOW()) + 7 * 86400 THEN 0.6
           WHEN ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + 30 * 86400 THEN 1.0
           WHEN ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + 90 * 86400 THEN 0.8
           ELSE 0.6
         END`;
      // s_amount 用户偏好中枢：历史解锁公告金额的对数域均值（LOG10(USD+1)）；样本 <2 取中性（全体 0.5，
      // 恒等于第四批常数行为）。MAX(amc.·) 包裹以兼容 ONLY_FULL_GROUP_BY（amc 按 notice_id 唯一）
      const [amountPrefRows] = await dbPool.query(
        `SELECT AVG(LOG10(c.amount_usd + 1)) AS center_log, COUNT(*) AS cnt
         FROM crm_opportunity_unlocks u
         INNER JOIN crm_notice_amount_cache c ON c.notice_id = u.notice_id
         WHERE u.user_key = ? AND u.notice_id IS NOT NULL AND c.amount_usd IS NOT NULL AND c.amount_usd > 0`,
        [userKey]
      );
      const amountCenterLog = Number((amountPrefRows as any[])[0]?.center_log || 0);
      const amountActive = Number((amountPrefRows as any[])[0]?.cnt || 0) >= 2;
      // 对数距离衰减：同数量级≈1，每差一个数量级 -1/3，差 3 个数量级→0；inferred 信心收缩向 0.5 靠拢
      const amountExpr = amountActive
        ? `(CASE WHEN MAX(amc.amount_usd) IS NULL OR MAX(amc.amount_usd) <= 0 THEN 0.5
              ELSE 0.5 + (GREATEST(0, 1 - ABS(LOG10(MAX(amc.amount_usd) + 1) - ?) / 3) - 0.5)
                   * IF(MAX(amc.inferred) = 1, 0.7, 1)
            END)`
        : "0.5";
      const recoScoreExpr = `ROUND(${wUnspsc} * LEAST(1, ${matchWeightExpr} / ?) + ${wUrgency} * (${urgencyExpr}) + ${wAmount} * ${amountExpr} + ${wNeutral}, 6)`;
      const amountScoreParams = amountActive ? [amountCenterLog] : [];

      // 本地差异 #12：T-C3 推荐理由标签（C.3.4）——只在评分 SQL 已有信号上顺带产出，零额外查询。
      // l4_hit：L4 全码兴趣命中（显著前缀长度 8 = 深度 4，与 matchWeightExpr 同款 LIKE 判定）
      const l4Prefixes = scoredCodes.filter((item) => item.prefix.length >= 8).map((item) => item.prefix);
      const l4HitExpr = l4Prefixes.length
        ? `MAX(${l4Prefixes.map(() => "(b.code LIKE ?)").join(" OR ")})`
        : "0";
      const l4Params = l4Prefixes.map((prefix) => `${prefix}%`);

      const [rows] = await dbPool.query(
        `SELECT
           n.id,
           n.notice_id,
           n.reference,
           n.title,
           n.notice_type,
           n.country,
           n.deadline,
           n.deadline_ts,
           n.estimated_value,
           n.description,
           n.documents,
           n.procurement_files,
           ${l4HitExpr} AS l4_hit,
           MAX(amc.amount_usd) AS amount_usd_cached,
           GROUP_CONCAT(DISTINCT b.code) AS codes_concat,
           COUNT(DISTINCT b.code) AS match_score,
           ${recoScoreExpr} AS reco_score
         FROM crm_bid_notices n
         INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.id
         LEFT JOIN crm_notice_amount_cache amc ON amc.notice_id = n.id
         WHERE (${bridgeWhere}) AND ${activeWhere}
         GROUP BY n.id
         ORDER BY reco_score DESC, (n.deadline_ts IS NULL), ${deadlineSecExpr}, n.id DESC
         LIMIT ? OFFSET ?`,
        [...l4Params, ...scoreParams, denominator, ...amountScoreParams, ...params, ...extraParams, pageSize, offset]
      );

      // 本地差异 #10：懒填充——当页公告金额缓存缺失/过版时后台补算（fire-and-forget，不阻塞响应）
      const pageNoticeIds = (rows as any[]).map((row) => Number(row.id)).filter(Boolean);
      if (pageNoticeIds.length) void backfillNoticeAmountCache(dbPool, pageNoticeIds).catch(() => undefined);

      // T-C3 标签推导（C.3.4）：具体 > 模糊，每卡至多 2 个；只用行内已算信号（l4_hit /
      // deadline_ts / amount_usd_cached），不泄露 agency/UNSPSC 明文等锁定字段。
      // preferred_region / similar_unlocked 键已在 i18n 预留，待 s_geo / 解锁来源信号积累后启用
      const HIGH_VALUE_USD = 1_000_000;
      const nowSec = Math.floor(Date.now() / 1000);
      const buildRecoReasons = (row: any): string[] => {
        const reasons: string[] = [];
        const deadlineSec = row.deadline_ts == null
          ? null
          : Number(row.deadline_ts) > 100000000000
            ? Math.floor(Number(row.deadline_ts) / 1000)
            : Number(row.deadline_ts);
        if (Number(row.l4_hit || 0) > 0) reasons.push("industry_match_l4");
        if (deadlineSec !== null && deadlineSec >= nowSec && deadlineSec <= nowSec + 30 * 86400) {
          reasons.push("recent_deadline");
        }
        if (Number(row.amount_usd_cached || 0) >= HIGH_VALUE_USD) reasons.push("high_value");
        if (reasons.length === 0) reasons.push("industry_match"); // 兜底：进推荐即行业相关（召回门槛 level2+）
        return reasons.slice(0, 2);
      };

      // 本地差异 #16：T-C6 s_text——用户解锁标题关键词 vs 候选标题+描述的 Jaccard 作独立加分维度。
      // 仅当页 JS 纯内存计算（每卡 O(词数)，零候选级 SQL；关键词集合走 10 分钟进程内缓存），
      // 加分并入 reco_score 供 MMR 相关性使用（当页内微调，不破 SQL 分页语义）。
      // 零解锁历史 keywords=null → 全部加分 0，排序与上线前恒等
      const unlockKeywords = await getUserUnlockKeywords(dbPool, userKey);
      if (unlockKeywords) {
        for (const row of rows as any[]) {
          const sText = jaccardTokenSim(
            unlockKeywords,
            tokenizeNoticeText(`${row.title || ""} ${row.description || ""}`)
          );
          if (sText > 0) {
            row.reco_score = Math.round((Number(row.reco_score || 0) + S_TEXT_BONUS * sText) * 1e6) / 1e6;
          }
        }
      }

      // 本地差异 #12：T-C4 MMR 当页多样性重排（C.3.2）。仅对当页 pageSize 条重排（不破 SQL 分页
      // 语义）；相似度 = 命中 UNSPSC 码集合的 Jaccard 重合度（codes_concat 顺带取自主查询，零额外
      // SQL）；λ=0.7 偏相关性。贪心确定性选取：分数并列取原序靠前者 → 同输入同输出
      const MMR_LAMBDA = 0.7;
      const mmrRerankPage = (pageRows: any[]): any[] => {
        if (pageRows.length <= 2) return pageRows;
        const codeSets = pageRows.map((row) =>
          new Set(String(row.codes_concat || "").split(",").filter(Boolean))
        );
        const jaccard = (a: Set<string>, b: Set<string>) => {
          if (a.size === 0 || b.size === 0) return 0;
          let inter = 0;
          for (const code of a) if (b.has(code)) inter++;
          return inter / (a.size + b.size - inter);
        };
        const remaining = pageRows.map((_, index) => index);
        const picked: number[] = [];
        while (remaining.length) {
          let bestPos = 0;
          let bestScore = -Infinity;
          for (let pos = 0; pos < remaining.length; pos++) {
            const index = remaining[pos];
            let maxSim = 0;
            for (const chosen of picked) {
              const sim = jaccard(codeSets[index], codeSets[chosen]);
              if (sim > maxSim) maxSim = sim;
            }
            const score = MMR_LAMBDA * Number(pageRows[index].reco_score || 0) - (1 - MMR_LAMBDA) * maxSim;
            if (score > bestScore) { // 严格大于：并列保持原序（确定性）
              bestScore = score;
              bestPos = pos;
            }
          }
          picked.push(remaining[bestPos]);
          remaining.splice(bestPos, 1);
        }
        return picked.map((index) => pageRows[index]);
      };

      res.json({
        items: mmrRerankPage(rows as any[]).map((row) => {
          const { l4_hit, amount_usd_cached, codes_concat, documents, procurement_files, ...rest } = row; // 剥离标签/MMR 推导用的中间信号列
          return {
            ...rest,
            match_score: Number(row.match_score || 0),
            reco_score: Number(row.reco_score || 0),
            reco_reasons: buildRecoReasons(row),
            agency: null,
            organization: null,
            source_url: null,
            unspsc_codes: [],
            core_locked: true,
            breakdown_file_count: normalizeDocumentRows(documents, procurement_files).length,
          };
        }),
        total: Number((countRows as any[])[0]?.total || 0),
        page,
        pageSize,
        variant, // T-B10：前端反馈埋点原样回传，指标 SQL 按 variant 聚合
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── 本地差异 #11：T-B6 推荐反馈端点（B.3.2.2）──
  // 支持批量：body.actions = [{notice_id, action, reco_score?, position?, variant?, dwell_ms?}]，
  // 单条可直接平铺在 body。写入 INSERT IGNORE（uk_dedup 兜底 D.7 前端 Set 预去重）。
  // 兴趣码联动：click +0.3 / favorite +0.8（persistUserInterestCodes，source 白名单）；
  // dismiss ×0.5 相对强衰减（E.3 负反馈，decayUserInterestCodes 带 0.01 下限）
  router.post("/api/notices/feedback", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.body.user_key) || ""; // F.1：guest/空一律拒收
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      const sessionId = String(req.body.session_id || "").trim().slice(0, 64);
      if (!sessionId) return res.status(400).json({ error: "SESSION_REQUIRED" }); // D.7：无 session 唯一约束失效
      const VALID_ACTIONS = new Set([
        "impression", "click", "unlock", "dismiss", "favorite",
        "dwell", "scroll_end", "quick_exit", "revisit",
      ]);
      const rawActions: any[] = Array.isArray(req.body.actions)
        ? req.body.actions
        : req.body.notice_id
          ? [req.body]
          : [];
      if (rawActions.length === 0) return res.status(400).json({ error: "ACTIONS_REQUIRED" });
      if (rawActions.length > 50) return res.status(400).json({ error: "TOO_MANY_ACTIONS", max: 50 }); // 批量曝光上限
      const items = rawActions
        .map((item) => ({
          noticeId: Number(item?.notice_id || 0),
          action: String(item?.action || "").trim(),
          recoScore: Number.isFinite(Number(item?.reco_score)) ? Number(item.reco_score) : null,
          position: Number.isInteger(Number(item?.position)) && Number(item.position) >= 0 ? Number(item.position) : null,
          variant: String(item?.variant || "").trim().slice(0, 20) || null,
          dwellMs: Number.isInteger(Number(item?.dwell_ms)) && Number(item.dwell_ms) > 0 ? Number(item.dwell_ms) : null,
        }))
        .filter((item) => item.noticeId > 0 && VALID_ACTIONS.has(item.action));
      if (items.length === 0) return res.status(400).json({ error: "NO_VALID_ACTIONS" });

      // 批量写入流水（INSERT IGNORE：uk_dedup 命中即静默去重，affectedRows 反映实际新增）
      const [insertResult] = await dbPool.query(
        `INSERT IGNORE INTO crm_user_reco_feedback
           (user_id, user_key, notice_id, action, reco_score, position, variant, session_id, dwell_ms)
         VALUES ${items.map(() => "((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
        items.flatMap((item) => [
          userKey, userKey, item.noticeId, item.action,
          item.recoScore, item.position, item.variant, sessionId, item.dwellMs,
        ])
      );
      const inserted = Number((insertResult as any)?.affectedRows || 0);

      // 兴趣码联动（click/favorite 正反馈、dismiss 负反馈）：一次查齐涉及公告的 unspsc_codes
      // T-C7（本地差异 #16：C.3.6）：隐式信号并入联动——dwell>30s +0.2 / scroll_end +0.1 /
      // revisit +0.5 / quick_exit ×0.95（轻于 dismiss ×0.5；decay 自带 GREATEST(0.01) 下限保护）。
      // 隐式与显式共表共 ENUM，action 枚举天然区分，互不混淆（验收口径）
      const linkedActions = items.filter((item) =>
        ["click", "favorite", "dismiss", "dwell", "scroll_end", "quick_exit", "revisit"].includes(item.action)
      );
      if (linkedActions.length) {
        const noticeIds = Array.from(new Set(linkedActions.map((item) => item.noticeId)));
        const [noticeRows] = await dbPool.query(
          `SELECT id, unspsc_codes FROM crm_bid_notices WHERE id IN (${noticeIds.map(() => "?").join(",")})`,
          noticeIds
        );
        const snapshotById = new Map<number, any[]>();
        for (const row of noticeRows as any[]) snapshotById.set(Number(row.id), normalizeUnspscCodes(row.unspsc_codes));
        for (const item of linkedActions) {
          const snapshot = snapshotById.get(item.noticeId);
          if (!snapshot || snapshot.length === 0) continue;
          if (item.action === "click") await persistUserInterestCodes(dbPool, userKey, snapshot, "feedback_click", 0.3);
          else if (item.action === "favorite") await persistUserInterestCodes(dbPool, userKey, snapshot, "feedback_favorite", 0.8);
          else if (item.action === "dismiss") await decayUserInterestCodes(dbPool, userKey, snapshot, 0.5); // E.3 相对强衰减
          // T-C7 隐式：dwell 服务端复核 dwell_ms ≥ 30s（前端已判，双保险防灌权重）
          else if (item.action === "dwell" && (item.dwellMs || 0) >= 30000)
            await persistUserInterestCodes(dbPool, userKey, snapshot, "feedback_dwell", 0.2);
          else if (item.action === "scroll_end") await persistUserInterestCodes(dbPool, userKey, snapshot, "feedback_scroll_end", 0.1);
          else if (item.action === "revisit") await persistUserInterestCodes(dbPool, userKey, snapshot, "feedback_revisit", 0.5);
          else if (item.action === "quick_exit") await decayUserInterestCodes(dbPool, userKey, snapshot, 0.95); // 秒退轻衰减，0.01 下限
        }
      }

      res.status(201).json({ success: true, received: items.length, inserted, deduped: items.length - inserted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/api/notices/:id/view", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.body.user_key) || "guest"; // 本地差异 #7：F.1 归一化收敛（浏览流水保留 guest）
      await dbPool.execute(
        `INSERT INTO crm_user_notice_views (user_id, user_key, notice_id, viewed_at, ip)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, NOW(), ?)`,
        [userKey, userKey, noticeId, req.ip || req.socket?.remoteAddress || "127.0.0.1"]
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/notices/:id/detail", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原不做 trim/lower）
      if (!noticeId || !userKey) return res.status(400).json({ error: "USER_AND_NOTICE_REQUIRED" });

      const [unlockRows] = await dbPool.query(
        "SELECT id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
        [userKey, noticeId]
      );
      const unlock = (unlockRows as any[])[0];
      if (!unlock) {
        return res.status(403).json({ error: "NOTICE_LOCKED", core_locked: true });
      }

      const [noticeRows] = await dbPool.query(
        `SELECT
           id,
           notice_id,
           reference,
           title,
           notice_type,
           agency,
           organization,
           country,
           deadline,
           deadline_ts,
           estimated_value,
           description,
           industry,
           url,
           contacts,
           documents,
           procurement_files,
           external_links,
           agency_full,
           published_date,
           difficulty,
           registration_level,
           key_contacts,
           unspsc_codes,
           converted_opp_id,
           is_converted
         FROM crm_bid_notices
         WHERE id = ?
         LIMIT 1`,
        [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });
      const opportunity = await findQualifiedOpportunityForNotice(dbPool, notice);

      res.json(normalizeNoticeDetailPayload(notice, unlock, opportunity));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/notices/:id/translation", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const lang = String(req.query.lang || "").toLowerCase();
      if (!noticeId || !NOTICE_TRANSLATION_LANGS[lang]) {
        return res.status(400).json({ error: "INVALID_NOTICE_OR_LANG" });
      }

      // 注：标题与正文描述均为公开内容（列表端点对所有人返回完整 description），
      // 付费内容（机构/联系人/原文链接/类目）不经过本端点，故此处无需解锁校验
      const [cachedRows] = await dbPool.query(
        "SELECT title_tr, description_tr FROM crm_notice_translations WHERE notice_id = ? AND lang = ? LIMIT 1",
        [noticeId, lang]
      );
      const cachedRow = (cachedRows as any[])[0];
      // 标题和描述都已缓存 → 直接返回
      if (cachedRow && cachedRow.title_tr && cachedRow.description_tr) {
        return res.json({
          lang,
          title: cachedRow.title_tr,
          description: cachedRow.description_tr,
          cached: true,
        });
      }
      // 仅有标题缓存（批量预翻译场景）→ 补翻描述，标题沿用已有缓存
      if (cachedRow && cachedRow.title_tr && !cachedRow.description_tr) {
        const [noticeRowsForDesc] = await dbPool.query(
          "SELECT description FROM crm_bid_notices WHERE id = ? LIMIT 1",
          [noticeId]
        );
        const noticeForDesc = (noticeRowsForDesc as any[])[0];
        if (!noticeForDesc || !String(noticeForDesc.description || "").trim()) {
          // 原文描述本身为空，直接返回已有标题
          return res.json({ lang, title: cachedRow.title_tr, description: null, cached: true });
        }
        const pendingKeyDesc = `${noticeId}:${lang}:desc`;
        let pendingDesc = pendingNoticeTranslations.get(pendingKeyDesc);
        if (!pendingDesc) {
          pendingDesc = translateNoticeViaChain(
            "", // 标题无需再翻译，传空串（translateNoticeViaChain 会返回空串占位）
            String(noticeForDesc.description),
            lang
          );
          pendingNoticeTranslations.set(pendingKeyDesc, pendingDesc);
          pendingDesc.finally(() => pendingNoticeTranslations.delete(pendingKeyDesc)).catch(() => undefined);
        }
        const { translations: descTranslations, provider: descProvider } = await pendingDesc;
        const descTr = descTranslations[1]; // [1] = description 译文
        await dbPool.query(
          `UPDATE crm_notice_translations SET description_tr = ?, model = ? WHERE notice_id = ? AND lang = ?`,
          [descTr, descProvider, noticeId, lang]
        );
        return res.json({ lang, title: cachedRow.title_tr, description: descTr, cached: false });
      }

      const [noticeRows] = await dbPool.query(
        "SELECT title, description FROM crm_bid_notices WHERE id = ? LIMIT 1",
        [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });

      const pendingKey = `${noticeId}:${lang}`;
      let pending = pendingNoticeTranslations.get(pendingKey);
      if (!pending) {
        pending = translateNoticeViaChain(
          String(notice.title || ""),
          String(notice.description || ""),
          lang
        );
        pendingNoticeTranslations.set(pendingKey, pending);
        pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
      }
      const { translations, provider } = await pending;

      await dbPool.query(
        `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
        [noticeId, lang, translations[0], translations[1], provider]
      );
      res.json({ lang, title: translations[0], description: translations[1], cached: false });
    } catch (err: any) {
      if (err?.message === "TRANSLATION_UNAVAILABLE") {
        return res.status(503).json({ error: "TRANSLATION_UNAVAILABLE" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/api/notices/:id/unlock", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      // 本地差异 #7：F.1——无有效 user_key 的解锁流水仍记 guest，但不落兴趣码（防共享伪用户脏画像）
      const normalizedUserKey = normalizeUserKey(req.body.user_key);
      const userKey = normalizedUserKey || "guest";
      const unlockType = req.body.unlock_type === "subscription" || req.body.unlock_type === "single"
        ? req.body.unlock_type
        : "free";
      const price = unlockType === "single" ? Number(req.body.price || 19) : 0;
      let consumedEntitlementId: number | null = null;

      const [existing] = await dbPool.query(
        "SELECT id FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
        [userKey, noticeId]
      );
      if ((existing as any[]).length > 0) return res.json({ success: true, alreadyUnlocked: true });

      if (unlockType === "free") {
        const [freePlanRows] = await dbPool.query(
          "SELECT free_quota FROM crm_membership_plans WHERE plan_code = 'free' LIMIT 1"
        );
        const freeQuota = Number((freePlanRows as any[])[0]?.free_quota || 3);
        const [freeRows] = await dbPool.query(
          "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type = 'free'",
          [userKey]
        );
        if (Number((freeRows as any[])[0]?.total || 0) >= freeQuota) {
          return res.status(402).json({ error: "FREE_LIMIT_REACHED" });
        }
      }

      if (unlockType === "subscription" || unlockType === "single") {
        const [entitlementRows] = await dbPool.query(
          `SELECT id
           FROM crm_user_entitlements
           WHERE user_key = ?
             AND status = 'active'
             AND quota_total > quota_used
             AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY expires_at IS NULL DESC, expires_at ASC, id ASC
           LIMIT 1`,
          [userKey]
        );
        const entitlement = (entitlementRows as any[])[0];
        if (!entitlement) {
          return res.status(402).json({ error: "PAID_QUOTA_REQUIRED" });
        }
        consumedEntitlementId = Number(entitlement.id);
      }

      const [noticeRows] = await dbPool.query(
        "SELECT id, unspsc_codes FROM crm_bid_notices WHERE id = ? LIMIT 1",
        [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "Notice not found" });
      const snapshot = normalizeUnspscCodes(notice.unspsc_codes);

      await dbPool.execute(
        `INSERT INTO crm_opportunity_unlocks
          (user_id, user_key, notice_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, NOW(), ?)`,
        [userKey, userKey, noticeId, unlockType, price, JSON.stringify(snapshot)]
      );
      if (consumedEntitlementId) {
        await dbPool.execute(
          "UPDATE crm_user_entitlements SET quota_used = quota_used + 1, updated_at = NOW() WHERE id = ? AND quota_total > quota_used",
          [consumedEntitlementId]
        );
      }

      // 本地差异 #7：F.1——guest 拒写兴趣码，解锁流水已在上方保留
      if (normalizedUserKey) {
        await persistUserInterestCodes(dbPool, userKey, snapshot, "unlock_order", 2.50);
      }

      res.status(201).json({ success: true, unlock_type: unlockType });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/api/notices/:id/interest", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.body.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原不做 trim/lower）
      const interestType = req.body.interest_type === "subscribed" ? "subscribed" : "interested";
      const note = String(req.body.note || "").slice(0, 500);
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const [noticeRows] = await dbPool.query(
        "SELECT id, unspsc_codes FROM crm_bid_notices WHERE id = ? LIMIT 1",
        [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "Notice not found" });

      await dbPool.execute(
        `INSERT INTO crm_notice_interests (user_id, user_key, notice_id, interest_type, source, note)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, 'detail_page', ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), note = VALUES(note), updated_at = NOW()`,
        [userKey, userKey, noticeId, interestType, note]
      );

      const snapshot = normalizeUnspscCodes(notice.unspsc_codes);
      await persistUserInterestCodes(
        dbPool,
        userKey,
        snapshot,
        interestType === "subscribed" ? "subscribe_notice" : "express_interest",
        interestType === "subscribed" ? 2.0 : 1.0
      );

      res.status(201).json({ success: true, interest_type: interestType });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
