/**
 * 公采推荐服务 — 编排入口
 * Notice recommendation orchestrator
 *
 * @module server/services/recommend
 * @description 基于用户兴趣码（90 天半衰期衰减）的召回 + 加权评分推荐，
 *              含权重画像 A/B、金额偏好、解锁关键词文本加分与 MMR 去重；
 *              无兴趣信号时回退按截止时间排序。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import {
  recomputeRecoWeightProfile, recoVariant,
  tokenizeNoticeText, jaccardTokenSim, S_TEXT_BONUS, getUserUnlockKeywords,
} from "../recommend";
import { backfillNoticeAmountCache } from "../amount";
import type { NoticesRepo } from "../../repos/notices.repo";
import { getTranslatedNoticeDetail } from "../notice-translation";
import { deadlineFallback, processInterestCodes } from "./recall";
import { buildScoringContext, getAmountPreference, resolveWeights } from "./scoring";
import { mmrRerankPage, buildRecoReasons } from "./rerank";

const DEADLINE_SEC_EXPR = "n.deadline_sec";
const ACTIVE_NOTICE_WHERE = `n.is_active = 1`;
const DEPTH_FACTOR: Record<number, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 };

// 推荐结果缓存
const recoResultCache = new Map<string, { data: NoticeRecommendResult; expires: number }>();
const RECO_RESULT_CACHE_TTL = 5 * 60 * 1000;
const RECO_RESULT_CACHE_MAX = 200;

export interface NoticeRecommendResult {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  variant?: string;
  fallback?: string;
}

export async function recommendNotices(
  pool: Pool, userKey: string, page: number, pageSize: number,
  locale?: string, noticesRepo?: NoticesRepo,
): Promise<NoticeRecommendResult> {
  const offset = (page - 1) * pageSize;
  if (!userKey) return deadlineFallback(pool, page, pageSize, offset, locale, noticesRepo);

  // 缓存命中检查
  const recoCacheKey = `${userKey}:${page}:${pageSize}:${locale || ""}`;
  const cachedReco = recoResultCache.get(recoCacheKey);
  if (cachedReco && cachedReco.expires > Date.now()) return cachedReco.data;

  // ── 召回：兴趣码衰减查询 ──
  const [interestRows] = await pool.query(
    `SELECT code, level, MAX(code_id) AS code_id,
            SUM(weight * EXP(-LN(2) * GREATEST(0, DATEDIFF(NOW(), COALESCE(updated_at, created_at))) / 90)) AS decayed_weight,
            MAX(COALESCE(updated_at, created_at)) AS last_update
     FROM crm_user_interest_codes WHERE user_key = ?
     GROUP BY code, level ORDER BY decayed_weight DESC, last_update DESC LIMIT 80`,
    [userKey],
  );

  const { scoredCodes, clauses, interestTotal } = processInterestCodes(interestRows as RowDataPacket[], DEPTH_FACTOR);
  if (clauses.bridgeWhere === "") return deadlineFallback(pool, page, pageSize, offset, locale, noticesRepo);

  // ── 评分上下文：COUNT + 权重画像并行 ──
  const variant = recoVariant(userKey);
  const [countResult, profileResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n
       INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
       WHERE (${clauses.bridgeWhere}) AND ${ACTIVE_NOTICE_WHERE}`,
      clauses.params,
    ),
    pool.query(
      `SELECT w_unspsc, w_agency, w_amount, w_geo, w_urgency, updated_at FROM crm_reco_weight_profile WHERE user_key = ? LIMIT 1`,
      [userKey],
    ),
  ]);
  const [countRows] = countResult;
  const [profileRows] = profileResult;
  const profileRow = (profileRows as RowDataPacket[])[0] || null;

  const { wUnspsc, wUrgency, wAmount, wNeutral, profileStale } = resolveWeights(profileRow, variant);
  if (profileStale) void recomputeRecoWeightProfile(pool, userKey).catch(() => undefined);

  // 金额偏好
  const { centerLog: amountCenterLog, active: amountActive } = await getAmountPreference(pool, userKey);

  // 构建评分表达式
  const scoring = buildScoringContext(scoredCodes, interestTotal, wUnspsc, wUrgency, wAmount, wNeutral, amountCenterLog, amountActive);

  // ── 主查询 ──
  const trJoin = locale ? "LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?" : "";
  const trParams = locale ? [locale] : [];
  const treJoin = "LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  const oppJoin = "LEFT JOIN crm_bid_opportunities opp_desc ON opp_desc.source_notice_id = n.notice_id AND (opp_desc.is_qualified = 1 OR opp_desc.status = 1 OR opp_desc.audit_status = 1)";
  const trSelect = locale ? "tr.title_tr AS title_i18n, tr.description_tr AS description_i18n," : "";
  const treSelect = "tre.title_tr AS title_en, tre.description_tr AS description_en,";

  let rows: any;
  try {
    [rows] = await pool.query(
      `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
         n.deadline, n.deadline_ts, n.estimated_value, n.agency,
         LEFT(n.description, 300) AS description, n.documents, n.procurement_files,
         ${trSelect} ${treSelect} MAX(opp_desc.description_cn) AS description_cn,
         LEFT(MAX(opp_desc.bid_overview), 200) AS bid_overview,
         MAX(opp_desc.beneficiary_countries) AS beneficiary_countries,
         ${scoring.l4HitExpr} AS l4_hit, MAX(amc.amount_usd) AS amount_usd_cached,
         GROUP_CONCAT(DISTINCT b.code) AS codes_concat,
         COUNT(DISTINCT b.code) AS match_score, ${scoring.recoScoreExpr} AS reco_score
       FROM crm_bid_notices n
       INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
       LEFT JOIN crm_notice_amount_cache amc ON amc.notice_id = n.id
       ${trJoin}
       ${treJoin}
       ${oppJoin}
       WHERE (${clauses.bridgeWhere}) AND ${ACTIVE_NOTICE_WHERE}
       GROUP BY n.id ORDER BY reco_score DESC, (n.deadline_ts IS NULL), ${DEADLINE_SEC_EXPR}, n.id DESC
       LIMIT ? OFFSET ?`,
      [...trParams, ...scoring.l4Params, ...scoring.scoreParams, scoring.denominator, ...scoring.amountScoreParams, ...clauses.params, pageSize, offset],
    );
  } catch (err) {
    console.error("[recommendNotices] main query failed, falling back to deadline:", err);
    return deadlineFallback(pool, page, pageSize, offset, locale, noticesRepo);
  }

  // ── 后处理 ──
  const pageNoticeIds = (rows as RowDataPacket[]).map((row) => Number(row.id)).filter(Boolean);
  if (pageNoticeIds.length) void backfillNoticeAmountCache(pool, pageNoticeIds).catch(() => undefined);

  // 解锁关键词文本相似度加分
  const unlockKeywords = await getUserUnlockKeywords(pool, userKey);
  if (unlockKeywords) {
    for (const row of rows as RowDataPacket[]) {
      const sText = jaccardTokenSim(unlockKeywords, tokenizeNoticeText(`${row.title || ""} ${row.description || ""}`));
      if (sText > 0) row.reco_score = Math.round((Number(row.reco_score || 0) + S_TEXT_BONUS * sText) * 1e6) / 1e6;
    }
  }

  // MMR 重排 + 结果映射
  const nowSec = Math.floor(Date.now() / 1000);
  const resultItems = mmrRerankPage(rows as RowDataPacket[]).map((row) => {
    const { l4_hit, amount_usd_cached, codes_concat, documents, procurement_files, ...rest } = row;
    return {
      ...rest, match_score: Number(row.match_score || 0), reco_score: Number(row.reco_score || 0),
      reco_reasons: buildRecoReasons(row, nowSec), organization: null, source_url: null,
      unspsc_codes: [], core_locked: true,
      breakdown_file_count: normalizeDocumentRows(documents, procurement_files).length,
    };
  });

  // 卡片国际化按需翻译
  if (locale && noticesRepo) {
    const rawRows = rows as RowDataPacket[];
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

  const result: NoticeRecommendResult = {
    items: resultItems,
    total: Number((countRows as RowDataPacket[])[0]?.total || 0), page, pageSize, variant,
  };

  // 写入缓存
  if (recoResultCache.size >= RECO_RESULT_CACHE_MAX) {
    const now = Date.now();
    for (const [key, entry] of recoResultCache) { if (entry.expires <= now) recoResultCache.delete(key); }
    if (recoResultCache.size >= RECO_RESULT_CACHE_MAX) recoResultCache.clear();
  }
  recoResultCache.set(recoCacheKey, { data: result, expires: Date.now() + RECO_RESULT_CACHE_TTL });

  return result;
}
