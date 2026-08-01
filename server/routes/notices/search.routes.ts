/**
 * 公采搜索/统计/推荐路由
 * Notice search, stats & recommendation routes
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { normalizeDocumentRows, normalizeUserKey } from "../../utils/normalize";
import { normalizeUnspscCodes, buildNoticeUnspscFilter } from "../../services/unspsc";
import {
  decayUserInterestCodes, recomputeRecoWeightProfile, recoVariant,
  tokenizeNoticeText, jaccardTokenSim, S_TEXT_BONUS, getUserUnlockKeywords,
} from "../../services/recommend";
import { backfillNoticeAmountCache } from "../../services/amount";
import { FEATURED_NOTICE_EXISTS } from "../../services/notices";

export function createNoticeSearchRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  // ── F.4 搜索性能预案第一档（本地差异 #7）──
  const noticeSearchCache = new Map<string, { payload: any; total: number; expires: number }>();
  const NOTICE_SEARCH_CACHE_TTL = 60 * 1000;
  const NOTICE_SEARCH_CACHE_MAX = 200;

  router.get("/api/notices", async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(30, Math.max(6, Number(req.query.page_size || 9)));
      const offset = (page - 1) * pageSize;
      const codeId = Number(req.query.code_id || req.query.industry_id || 0);
      const q = String(req.query.q || "").trim().slice(0, 200);
      const country = String(req.query.country || "").trim().slice(0, 100);
      const deadlineFrom = String(req.query.deadline_from || "").trim();
      const deadlineTo = String(req.query.deadline_to || "").trim();
      const sort = String(req.query.sort || "deadline");
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      const valueMin = Number.isFinite(Number(req.query.value_min)) && Number(req.query.value_min) > 0
        ? Number(req.query.value_min) : 0;
      const valueMax = Number.isFinite(Number(req.query.value_max)) && Number(req.query.value_max) > 0
        ? Number(req.query.value_max) : 0;
      const deadlineWithinDays = Number.isInteger(Number(req.query.deadline_within_days))
        ? Math.min(365, Math.max(0, Number(req.query.deadline_within_days))) : 0;
      const noticeType = String(req.query.notice_type || "").trim().slice(0, 100);
      // [精选功能重新启用 2026-07-31] featured=1 只看精选（三路合格机会判定，T-A4）
      const featuredOnly = String(req.query.featured || "") === "1";

      const hasSearch = Boolean(
        q || country || dateRe.test(deadlineFrom) || dateRe.test(deadlineTo) ||
        valueMin || valueMax || deadlineWithinDays || noticeType || featuredOnly
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

      const cacheKey = hasSearch
        ? JSON.stringify([page, pageSize, codeId, q, country, deadlineFrom, deadlineTo, sort,
            valueMin, valueMax, deadlineWithinDays, noticeType, featuredOnly])
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

      const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
      where.push(`(n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`);

      if (codeId) {
        const filter = await buildNoticeUnspscFilter(dbPool, codeId);
        idFilterSql = filter.sql;
        idFilterParams.push(...filter.params);
      }

      const compactQ = q.replace(/\s+/g, "").toUpperCase();
      if (q) {
        join += " LEFT JOIN crm_notice_translations qzh ON qzh.notice_id = n.id AND qzh.lang = 'zh'";
        join += " LEFT JOIN crm_notice_translations qen ON qen.notice_id = n.id AND qen.lang = 'en'";
        const likeQ = `%${q}%`;
        where.push(
          "(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ? OR n.title LIKE ? OR n.reference LIKE ? OR n.description LIKE ? OR qzh.title_tr LIKE ? OR qzh.description_tr LIKE ? OR qen.title_tr LIKE ? OR qen.description_tr LIKE ?)"
        );
        params.push(compactQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ, likeQ);
      }
      if (country) {
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
      if (deadlineWithinDays > 0) {
        where.push(`n.deadline_ts IS NOT NULL AND ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + ? * 86400`);
        params.push(deadlineWithinDays);
      }
      if (noticeType) {
        where.push("n.notice_type LIKE ?");
        params.push(`%${noticeType}%`);
      }
      if (valueMin || valueMax) {
        join += " INNER JOIN crm_notice_amount_cache vamc ON vamc.notice_id = n.id AND vamc.amount_usd IS NOT NULL";
        if (valueMin) { where.push("vamc.amount_usd >= ?"); params.push(valueMin); }
        if (valueMax) { where.push("vamc.amount_usd <= ?"); params.push(valueMax); }
      }
      // 精选过滤：只保留能三路关联到合格机会（crm_bid_opportunities）的公告；
      // 可投标期限由上方既有 is_expired/deadline_ts 条件保障，与其他筛选条件 AND 叠加
      if (featuredOnly) {
        where.push(FEATURED_NOTICE_EXISTS);
      }

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
        `SELECT DISTINCT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
           n.deadline, n.deadline_ts, n.estimated_value, n.description
         FROM crm_bid_notices n ${idFilterSql}${join} WHERE ${whereSql}
         ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
        [...idFilterParams, ...params, ...orderParams, pageSize, offset]
      );

      const pageIds = (rows as any[]).map((row) => Number(row.id)).filter(Boolean);
      const breakdownCounts = new Map<number, number>();
      // 页级 is_featured 标注：featuredOnly 时全部命中，否则仅对当页 ≤30 条回查三路判定
      const featuredIds = new Set<number>();
      if (pageIds.length > 0 && featuredOnly) {
        for (const id of pageIds) featuredIds.add(id);
      } else if (pageIds.length > 0) {
        try {
          const [featRows] = await dbPool.query(
            `SELECT n.id FROM crm_bid_notices n WHERE n.id IN (${pageIds.map(() => "?").join(",")}) AND ${FEATURED_NOTICE_EXISTS}`,
            pageIds
          );
          for (const featRow of featRows as any[]) featuredIds.add(Number(featRow.id));
        } catch { /* 标注查询失败：静默降级，不影响列表主体 */ }
      }
      if (pageIds.length > 0) {
        try {
          const [docRows] = await dbPool.query(
            `SELECT id, documents, procurement_files FROM crm_bid_notices WHERE id IN (${pageIds.map(() => "?").join(",")})`,
            pageIds
          );
          for (const docRow of docRows as any[]) {
            breakdownCounts.set(Number(docRow.id), normalizeDocumentRows(docRow.documents, docRow.procurement_files).length);
          }
        } catch { /* 计数查询失败：静默降级 */ }
      }

      const payload = {
        items: (rows as any[]).map((row) => ({
          ...row, agency: null, organization: null, source_url: null, unspsc_codes: [], core_locked: true,
          is_featured: featuredIds.has(Number(row.id)),
          breakdown_file_count: breakdownCounts.has(Number(row.id)) ? breakdownCounts.get(Number(row.id)) : undefined,
        })),
        total, page, pageSize,
      };
      res.json(payload);

      if (cacheKey) {
        if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) {
          const now = Date.now();
          for (const [key, entry] of noticeSearchCache) { if (entry.expires <= now) noticeSearchCache.delete(key); }
          if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) noticeSearchCache.clear();
        }
        noticeSearchCache.set(cacheKey, { payload, total, expires: Date.now() + NOTICE_SEARCH_CACHE_TTL });
      }
      logSearch(total);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── G.3 国家下拉数据源（增强版：移除 LIMIT 100，返回全量国家供前端搜索过滤）──
  let noticeCountriesCache: { data: any[]; expires: number } | null = null;
  router.get("/api/notices/countries", async (_req, res) => {
    try {
      if (noticeCountriesCache && noticeCountriesCache.expires > Date.now()) return res.json(noticeCountriesCache.data);
      const [rows] = await dbPool.query(
        `SELECT n.country, COUNT(*) AS cnt FROM crm_bid_notices n
         WHERE (n.is_expired = 0 OR n.is_expired IS NULL) AND n.country IS NOT NULL AND n.country <> ''
         GROUP BY n.country ORDER BY cnt DESC`
      );
      const data = (rows as any[]).map((row) => ({ country: row.country, count: Number(row.cnt) }));
      noticeCountriesCache = { data, expires: Date.now() + 10 * 60 * 1000 };
      res.json(data);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── 公采池统计 ──
  let noticeStatsCache: { data: any; expires: number } | null = null;
  router.get("/api/notices/stats", async (_req, res) => {
    try {
      if (noticeStatsCache && noticeStatsCache.expires > Date.now()) return res.json(noticeStatsCache.data);
      const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
      const activeWhere = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`;
      const [rawRows] = await dbPool.query("SELECT COUNT(*) AS total FROM crm_bid_notices n");
      const [activeRows] = await dbPool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${activeWhere}`);
      const [bridgedRows] = await dbPool.query(
        `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${activeWhere}
         AND EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.notice_id)`
      );
      // [精选功能重新启用 2026-07-31] 恢复真实精选计数（结果随 stats 缓存 10 分钟）
      const [featuredRows] = await dbPool.query(
        `SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${activeWhere} AND ${FEATURED_NOTICE_EXISTS}`
      );
      const active = Number((activeRows as any[])[0]?.total || 0);
      const bridged = Number((bridgedRows as any[])[0]?.total || 0);
      const data = {
        raw: Number((rawRows as any[])[0]?.total || 0), active, bridged,
        featured: Number((featuredRows as any[])[0]?.total || 0), bridge_gap: active - bridged,
      };
      noticeStatsCache = { data, expires: Date.now() + 10 * 60 * 1000 };
      res.json(data);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── 推荐端点 ──
  router.get("/api/notices/recommended", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || "";
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(30, Math.max(6, Number(req.query.page_size || 9)));
      const offset = (page - 1) * pageSize;

      const respondDeadlineFallback = async () => {
        const dlSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
        const activeW = "(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR " + dlSecExpr + " >= UNIX_TIMESTAMP(NOW()))";
        const [[cntRow]] = await dbPool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${activeW}`) as any[];
        const [fallbackRows] = await dbPool.query(
          `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
                  n.deadline, n.deadline_ts, n.estimated_value, n.description, n.documents, n.procurement_files
           FROM crm_bid_notices n WHERE ${activeW} ORDER BY ${dlSecExpr} DESC LIMIT ? OFFSET ?`, [pageSize, offset]);
        return res.json({
          items: (fallbackRows as any[]).map(row => ({
            ...row, match_score: 0, reco_score: 0, agency: null, organization: null, source_url: null,
            unspsc_codes: [], core_locked: true,
            breakdown_file_count: normalizeDocumentRows(row.documents, row.procurement_files).length,
            documents: undefined, procurement_files: undefined,
          })),
          total: Number((cntRow as any).total), page, pageSize, fallback: "deadline",
        });
      };
      if (!userKey) return respondDeadlineFallback();

      const [interestRows] = await dbPool.query(
        `SELECT code, level, MAX(code_id) AS code_id,
                SUM(weight * EXP(-LN(2) * GREATEST(0, DATEDIFF(NOW(), COALESCE(updated_at, created_at))) / 90)) AS decayed_weight,
                MAX(COALESCE(updated_at, created_at)) AS last_update
         FROM crm_user_interest_codes WHERE user_key = ?
         GROUP BY code, level ORDER BY decayed_weight DESC, last_update DESC LIMIT 80`,
        [userKey]
      );

      const DEPTH_FACTOR: Record<number, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 };
      const scoredCodes: Array<{ prefix: string; weighted: number }> = [];
      let interestTotal = 0;
      const significantPrefix = (code: string) => {
        let s = code;
        while (s.length > 2 && s.length % 2 === 0 && s.endsWith("00")) s = s.slice(0, -2);
        return s;
      };
      const recallIdsByLevel: Record<number, number[]> = { 2: [], 3: [], 4: [], 5: [] };
      const recallLikePrefixes = new Set<string>();
      for (const row of interestRows as any[]) {
        const level = Math.min(5, Math.max(1, Number(row.level || 1)));
        const code = String(row.code || "").trim();
        if (!code) continue;
        const prefix = significantPrefix(code);
        if (level >= 2) {
          const codeId = Number(row.code_id || 0);
          if (codeId > 0) recallIdsByLevel[level].push(codeId);
          else if (prefix.length >= 4) recallLikePrefixes.add(prefix);
        }
        const decayed = Number(row.decayed_weight || 0);
        if (decayed <= 0) continue;
        interestTotal += decayed;
        const depth = Math.min(4, Math.max(1, prefix.length / 2));
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

      if (clauses.length === 0) return respondDeadlineFallback();

      const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
      let activeWhere = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`;
      const extraParams: any[] = [];

      const bridgeWhere = clauses.map((clause) => `(${clause})`).join(" OR ");
      const [countRows] = await dbPool.query(
        `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n
         INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
         WHERE (${bridgeWhere}) AND ${activeWhere}`,
        [...params, ...extraParams]
      );

      const variant = recoVariant(userKey);
      const [profileRows] = await dbPool.query(
        `SELECT w_unspsc, w_agency, w_amount, w_geo, w_urgency, updated_at FROM crm_reco_weight_profile WHERE user_key = ? LIMIT 1`,
        [userKey]
      );
      const profileRow = (profileRows as any[])[0] || null;
      const profile = variant === "treatment" ? profileRow : null;
      const pickWeight = (value: any, fallback: number) => {
        const n = Number(value); return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
      };
      const wUnspsc = pickWeight(profile?.w_unspsc, 0.5);
      const wUrgency = pickWeight(profile?.w_urgency, 0.15);
      const wAmount = pickWeight(profile?.w_amount, 0.1);
      const wNeutral = (pickWeight(profile?.w_agency, 0.15) + pickWeight(profile?.w_geo, 0.1)) * 0.5;
      const profileStale = !profileRow || !profileRow.updated_at ||
        Date.now() - new Date(profileRow.updated_at).getTime() > 24 * 3600 * 1000;
      if (profileStale) void recomputeRecoWeightProfile(dbPool, userKey).catch(() => undefined);

      const scoreParams: any[] = [];
      const matchWeightExpr = scoredCodes.length
        ? `(${scoredCodes.map(() => "MAX(b.code LIKE ?) * ?").join(" + ")})` : "0";
      for (const item of scoredCodes) scoreParams.push(`${item.prefix}%`, item.weighted);
      const denominator = interestTotal > 0 ? interestTotal : 1;
      const urgencyExpr = `CASE
           WHEN n.deadline_ts IS NULL THEN 0.5
           WHEN ${deadlineSecExpr} < UNIX_TIMESTAMP(NOW()) + 7 * 86400 THEN 0.6
           WHEN ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + 30 * 86400 THEN 1.0
           WHEN ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + 90 * 86400 THEN 0.8
           ELSE 0.6 END`;

      const [amountPrefRows] = await dbPool.query(
        `SELECT AVG(LOG10(c.amount_usd + 1)) AS center_log, COUNT(*) AS cnt
         FROM crm_opportunity_unlocks u
         INNER JOIN crm_notice_amount_cache c ON c.notice_id = u.notice_id
         WHERE u.user_key = ? AND u.notice_id IS NOT NULL AND c.amount_usd IS NOT NULL AND c.amount_usd > 0`,
        [userKey]
      );
      const amountCenterLog = Number((amountPrefRows as any[])[0]?.center_log || 0);
      const amountActive = Number((amountPrefRows as any[])[0]?.cnt || 0) >= 2;
      const amountExpr = amountActive
        ? `(CASE WHEN MAX(amc.amount_usd) IS NULL OR MAX(amc.amount_usd) <= 0 THEN 0.5
              ELSE 0.5 + (GREATEST(0, 1 - ABS(LOG10(MAX(amc.amount_usd) + 1) - ?) / 3) - 0.5) * IF(MAX(amc.inferred) = 1, 0.7, 1) END)`
        : "0.5";
      const recoScoreExpr = `ROUND(${wUnspsc} * LEAST(1, ${matchWeightExpr} / ?) + ${wUrgency} * (${urgencyExpr}) + ${wAmount} * ${amountExpr} + ${wNeutral}, 6)`;
      const amountScoreParams = amountActive ? [amountCenterLog] : [];

      const l4Prefixes = scoredCodes.filter((item) => item.prefix.length >= 8).map((item) => item.prefix);
      const l4HitExpr = l4Prefixes.length
        ? `MAX(${l4Prefixes.map(() => "(b.code LIKE ?)").join(" OR ")})` : "0";
      const l4Params = l4Prefixes.map((prefix) => `${prefix}%`);

      const [rows] = await dbPool.query(
        `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
           n.deadline, n.deadline_ts, n.estimated_value, n.description, n.documents, n.procurement_files,
           ${l4HitExpr} AS l4_hit, MAX(amc.amount_usd) AS amount_usd_cached,
           GROUP_CONCAT(DISTINCT b.code) AS codes_concat,
           COUNT(DISTINCT b.code) AS match_score, ${recoScoreExpr} AS reco_score
         FROM crm_bid_notices n
         INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
         LEFT JOIN crm_notice_amount_cache amc ON amc.notice_id = n.id
         WHERE (${bridgeWhere}) AND ${activeWhere}
         GROUP BY n.id ORDER BY reco_score DESC, (n.deadline_ts IS NULL), ${deadlineSecExpr}, n.id DESC
         LIMIT ? OFFSET ?`,
        [...l4Params, ...scoreParams, denominator, ...amountScoreParams, ...params, ...extraParams, pageSize, offset]
      );

      const pageNoticeIds = (rows as any[]).map((row) => Number(row.id)).filter(Boolean);
      if (pageNoticeIds.length) void backfillNoticeAmountCache(dbPool, pageNoticeIds).catch(() => undefined);

      const HIGH_VALUE_USD = 1_000_000;
      const nowSec = Math.floor(Date.now() / 1000);
      const buildRecoReasons = (row: any): string[] => {
        const reasons: string[] = [];
        const deadlineSec = row.deadline_ts == null ? null
          : Number(row.deadline_ts) > 100000000000 ? Math.floor(Number(row.deadline_ts) / 1000) : Number(row.deadline_ts);
        if (Number(row.l4_hit || 0) > 0) reasons.push("industry_match_l4");
        if (deadlineSec !== null && deadlineSec >= nowSec && deadlineSec <= nowSec + 30 * 86400) reasons.push("recent_deadline");
        if (Number(row.amount_usd_cached || 0) >= HIGH_VALUE_USD) reasons.push("high_value");
        if (reasons.length === 0) reasons.push("industry_match");
        return reasons.slice(0, 2);
      };

      const unlockKeywords = await getUserUnlockKeywords(dbPool, userKey);
      if (unlockKeywords) {
        for (const row of rows as any[]) {
          const sText = jaccardTokenSim(unlockKeywords, tokenizeNoticeText(`${row.title || ""} ${row.description || ""}`));
          if (sText > 0) row.reco_score = Math.round((Number(row.reco_score || 0) + S_TEXT_BONUS * sText) * 1e6) / 1e6;
        }
      }

      const MMR_LAMBDA = 0.7;
      const mmrRerankPage = (pageRows: any[]): any[] => {
        if (pageRows.length <= 2) return pageRows;
        const codeSets = pageRows.map((row) => new Set(String(row.codes_concat || "").split(",").filter(Boolean)));
        const jaccard = (a: Set<string>, b: Set<string>) => {
          if (a.size === 0 || b.size === 0) return 0;
          let inter = 0; for (const code of a) if (b.has(code)) inter++;
          return inter / (a.size + b.size - inter);
        };
        const remaining = pageRows.map((_, index) => index);
        const picked: number[] = [];
        while (remaining.length) {
          let bestPos = 0; let bestScore = -Infinity;
          for (let pos = 0; pos < remaining.length; pos++) {
            const index = remaining[pos]; let maxSim = 0;
            for (const chosen of picked) { const sim = jaccard(codeSets[index], codeSets[chosen]); if (sim > maxSim) maxSim = sim; }
            const score = MMR_LAMBDA * Number(pageRows[index].reco_score || 0) - (1 - MMR_LAMBDA) * maxSim;
            if (score > bestScore) { bestScore = score; bestPos = pos; }
          }
          picked.push(remaining[bestPos]); remaining.splice(bestPos, 1);
        }
        return picked.map((index) => pageRows[index]);
      };

      res.json({
        items: mmrRerankPage(rows as any[]).map((row) => {
          const { l4_hit, amount_usd_cached, codes_concat, documents, procurement_files, ...rest } = row;
          return {
            ...rest, match_score: Number(row.match_score || 0), reco_score: Number(row.reco_score || 0),
            reco_reasons: buildRecoReasons(row), agency: null, organization: null, source_url: null,
            unspsc_codes: [], core_locked: true,
            breakdown_file_count: normalizeDocumentRows(documents, procurement_files).length,
          };
        }),
        total: Number((countRows as any[])[0]?.total || 0), page, pageSize, variant,
      });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  return router;
}
