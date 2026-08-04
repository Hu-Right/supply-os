/**
 * 公采推荐服务
 * Notice recommendation service
 *
 * @module server/services/noticeRecommend
 * @description 基于用户兴趣码（90 天半衰期衰减）的召回 + 加权评分推荐，
 *              含权重画像 A/B、金额偏好、解锁关键词文本加分与 MMR 去重；
 *              无兴趣信号时回退按截止时间排序。
 *              Interest-code recall (90-day half-life decay) with weighted
 *              scoring, profile A/B, amount preference, unlock-keyword text
 *              bonus and MMR rerank; deadline-ordered fallback when the user
 *              has no interest signal.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../utils/normalize";
import {
  recomputeRecoWeightProfile, recoVariant,
  tokenizeNoticeText, jaccardTokenSim, S_TEXT_BONUS, getUserUnlockKeywords,
} from "./recommend";
import { backfillNoticeAmountCache } from "./amount";
import type { NoticesRepo } from "../repos/notices.repo";
import { getTranslatedNoticeDetail } from "./notice-translation";

const DEADLINE_SEC_EXPR = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
const ACTIVE_NOTICE_WHERE = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${DEADLINE_SEC_EXPR} >= UNIX_TIMESTAMP(NOW()))`;
const DEPTH_FACTOR: Record<number, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 };
const HIGH_VALUE_USD = 1_000_000;
const MMR_LAMBDA = 0.7;

export interface NoticeRecommendResult {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  variant?: string;
  fallback?: string;
}

async function deadlineFallback(pool: Pool, page: number, pageSize: number, offset: number, locale?: string, noticesRepo?: NoticesRepo): Promise<NoticeRecommendResult> {
  const [cntRows] = await pool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE}`);
  const cntRow = (cntRows as RowDataPacket[])[0];
  // 卡片国际化：LEFT JOIN 翻译表（当前语言 + 英文回退）
  const trJoin = locale ? "LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?" : "";
  const trParams = locale ? [locale] : [];
  const treJoin = "LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  const oppJoin = "LEFT JOIN crm_bid_opportunities opp_desc ON opp_desc.id = n.converted_opp_id AND (opp_desc.is_qualified = 1 OR opp_desc.status = 'won' OR opp_desc.audit_status = 1)";
  // 路径2（source_notice_id）改用标量子查询，避免多行 JOIN 导致 DISTINCT 失效、分页溢出
  const trSelect = locale ? "tr.title_tr AS title_i18n, tr.description_tr AS description_i18n," : "";
  const treSelect = "tre.title_tr AS title_en, tre.description_tr AS description_en,";
  const [fallbackRows] = await pool.query(
    `SELECT DISTINCT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
            n.deadline, n.deadline_ts, n.estimated_value, n.description, n.documents, n.procurement_files,
            ${trSelect} ${treSelect} COALESCE(opp_desc.description_cn, (SELECT opp2.description_cn FROM crm_bid_opportunities opp2 WHERE opp2.source_notice_id = n.notice_id AND (opp2.is_qualified = 1 OR opp2.status = 'won' OR opp2.audit_status = 1) AND opp2.source_notice_id IS NOT NULL AND opp2.source_notice_id <> '' LIMIT 1)) AS description_cn
     FROM crm_bid_notices n ${trJoin} ${treJoin} ${oppJoin} WHERE ${ACTIVE_NOTICE_WHERE} ORDER BY ${DEADLINE_SEC_EXPR} DESC LIMIT ? OFFSET ?`, [...trParams, pageSize, offset]);
  const fallbackItems = (fallbackRows as RowDataPacket[]).map(row => ({
    ...row, match_score: 0, reco_score: 0, agency: null, organization: null, source_url: null,
    unspsc_codes: [], core_locked: true,
    breakdown_file_count: normalizeDocumentRows(row.documents, row.procurement_files).length,
    documents: undefined, procurement_files: undefined,
  }));

  // ── 卡片国际化按需翻译：异步写入缓存，不阻塞当前响应 ──
  if (locale && noticesRepo) {
    const missingRows = (fallbackRows as RowDataPacket[]).filter((row) => !row.title_i18n);
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

  return {
    items: fallbackItems,
    total: Number((cntRow as RowDataPacket).total), page, pageSize, fallback: "deadline",
  };
}

// 截断 UNSPSC 码尾部冗余 "00" 段，得到有效显著前缀
function significantPrefix(code: string): string {
  let s = code;
  while (s.length > 2 && s.length % 2 === 0 && s.endsWith("00")) s = s.slice(0, -2);
  return s;
}

// 推荐原因标注：L4 行业命中 > 临期 > 高价值，最多两条
function buildRecoReasons(row: any, nowSec: number): string[] {
  const reasons: string[] = [];
  const deadlineSec = row.deadline_ts == null ? null
    : Number(row.deadline_ts) > 100000000000 ? Math.floor(Number(row.deadline_ts) / 1000) : Number(row.deadline_ts);
  if (Number(row.l4_hit || 0) > 0) reasons.push("industry_match_l4");
  if (deadlineSec !== null && deadlineSec >= nowSec && deadlineSec <= nowSec + 30 * 86400) reasons.push("recent_deadline");
  if (Number(row.amount_usd_cached || 0) >= HIGH_VALUE_USD) reasons.push("high_value");
  if (reasons.length === 0) reasons.push("industry_match");
  return reasons.slice(0, 2);
}

// MMR 页内重排：reco_score 与已选公告 UNSPSC 码 Jaccard 相似度的权衡
function mmrRerankPage(pageRows: any[]): any[] {
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
}

export async function recommendNotices(pool: Pool, userKey: string, page: number, pageSize: number, locale?: string, noticesRepo?: NoticesRepo): Promise<NoticeRecommendResult> {
  const offset = (page - 1) * pageSize;
  if (!userKey) return deadlineFallback(pool, page, pageSize, offset, locale, noticesRepo);

  const [interestRows] = await pool.query(
    `SELECT code, level, MAX(code_id) AS code_id,
            SUM(weight * EXP(-LN(2) * GREATEST(0, DATEDIFF(NOW(), COALESCE(updated_at, created_at))) / 90)) AS decayed_weight,
            MAX(COALESCE(updated_at, created_at)) AS last_update
     FROM crm_user_interest_codes WHERE user_key = ?
     GROUP BY code, level ORDER BY decayed_weight DESC, last_update DESC LIMIT 80`,
    [userKey]
  );

  const scoredCodes: Array<{ prefix: string; weighted: number }> = [];
  let interestTotal = 0;
  const recallIdsByLevel: Record<number, number[]> = { 2: [], 3: [], 4: [], 5: [] };
  const recallLikePrefixes = new Set<string>();
  for (const row of interestRows as RowDataPacket[]) {
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

  if (clauses.length === 0) return deadlineFallback(pool, page, pageSize, offset, locale, noticesRepo);

  const extraParams: any[] = [];
  const bridgeWhere = clauses.map((clause) => `(${clause})`).join(" OR ");
  const [countRows] = await pool.query(
    `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n
     INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
     WHERE (${bridgeWhere}) AND ${ACTIVE_NOTICE_WHERE}`,
    [...params, ...extraParams]
  );

  const variant = recoVariant(userKey);
  const [profileRows] = await pool.query(
    `SELECT w_unspsc, w_agency, w_amount, w_geo, w_urgency, updated_at FROM crm_reco_weight_profile WHERE user_key = ? LIMIT 1`,
    [userKey]
  );
  const profileRow = (profileRows as RowDataPacket[])[0] || null;
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
  if (profileStale) void recomputeRecoWeightProfile(pool, userKey).catch(() => undefined);

  const scoreParams: any[] = [];
  const matchWeightExpr = scoredCodes.length
    ? `(${scoredCodes.map(() => "MAX(b.code LIKE ?) * ?").join(" + ")})` : "0";
  for (const item of scoredCodes) scoreParams.push(`${item.prefix}%`, item.weighted);
  const denominator = interestTotal > 0 ? interestTotal : 1;
  const urgencyExpr = `CASE
       WHEN n.deadline_ts IS NULL THEN 0.5
       WHEN ${DEADLINE_SEC_EXPR} < UNIX_TIMESTAMP(NOW()) + 7 * 86400 THEN 0.6
       WHEN ${DEADLINE_SEC_EXPR} <= UNIX_TIMESTAMP(NOW()) + 30 * 86400 THEN 1.0
       WHEN ${DEADLINE_SEC_EXPR} <= UNIX_TIMESTAMP(NOW()) + 90 * 86400 THEN 0.8
       ELSE 0.6 END`;

  const [amountPrefRows] = await pool.query(
    `SELECT AVG(LOG10(c.amount_usd + 1)) AS center_log, COUNT(*) AS cnt
     FROM crm_opportunity_unlocks u
     INNER JOIN crm_notice_amount_cache c ON c.notice_id = u.notice_id
     WHERE u.user_key = ? AND u.notice_id IS NOT NULL AND c.amount_usd IS NOT NULL AND c.amount_usd > 0`,
    [userKey]
  );
  const amountCenterLog = Number((amountPrefRows as RowDataPacket[])[0]?.center_log || 0);
  const amountActive = Number((amountPrefRows as RowDataPacket[])[0]?.cnt || 0) >= 2;
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

  // 卡片国际化：LEFT JOIN 翻译表（当前语言 + 英文回退）
  const trJoin = locale ? "LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?" : "";
  const trParams = locale ? [locale] : [];
  const treJoin = "LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  const oppJoin = "LEFT JOIN crm_bid_opportunities opp_desc ON opp_desc.id = n.converted_opp_id AND (opp_desc.is_qualified = 1 OR opp_desc.status = 'won' OR opp_desc.audit_status = 1)";
  const oppJoin2 = "LEFT JOIN crm_bid_opportunities opp_desc2 ON opp_desc2.source_notice_id = n.notice_id AND (opp_desc2.is_qualified = 1 OR opp_desc2.status = 'won' OR opp_desc2.audit_status = 1) AND opp_desc2.source_notice_id IS NOT NULL AND opp_desc2.source_notice_id <> ''";
  const trSelect = locale ? "tr.title_tr AS title_i18n, tr.description_tr AS description_i18n," : "";
  const treSelect = "tre.title_tr AS title_en, tre.description_tr AS description_en,";
  const [rows] = await pool.query(
    `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
       n.deadline, n.deadline_ts, n.estimated_value, n.description, n.documents, n.procurement_files,
       ${trSelect} ${treSelect} MAX(COALESCE(opp_desc.description_cn, opp_desc2.description_cn)) AS description_cn,
       ${l4HitExpr} AS l4_hit, MAX(amc.amount_usd) AS amount_usd_cached,
       GROUP_CONCAT(DISTINCT b.code) AS codes_concat,
       COUNT(DISTINCT b.code) AS match_score, ${recoScoreExpr} AS reco_score
     FROM crm_bid_notices n
     INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
     LEFT JOIN crm_notice_amount_cache amc ON amc.notice_id = n.id
     ${trJoin}
     ${treJoin}
     ${oppJoin}
     ${oppJoin2}
     WHERE (${bridgeWhere}) AND ${ACTIVE_NOTICE_WHERE}
     GROUP BY n.id ORDER BY reco_score DESC, (n.deadline_ts IS NULL), ${DEADLINE_SEC_EXPR}, n.id DESC
     LIMIT ? OFFSET ?`,
    [...trParams, ...l4Params, ...scoreParams, denominator, ...amountScoreParams, ...params, ...extraParams, pageSize, offset]
  );

  const pageNoticeIds = (rows as RowDataPacket[]).map((row) => Number(row.id)).filter(Boolean);
  if (pageNoticeIds.length) void backfillNoticeAmountCache(pool, pageNoticeIds).catch(() => undefined);

  // 解锁关键词文本相似度加分（S_TEXT 项，服务端重算后仍走 MMR 重排）
  const unlockKeywords = await getUserUnlockKeywords(pool, userKey);
  if (unlockKeywords) {
    for (const row of rows as RowDataPacket[]) {
      const sText = jaccardTokenSim(unlockKeywords, tokenizeNoticeText(`${row.title || ""} ${row.description || ""}`));
      if (sText > 0) row.reco_score = Math.round((Number(row.reco_score || 0) + S_TEXT_BONUS * sText) * 1e6) / 1e6;
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const resultItems = mmrRerankPage(rows as RowDataPacket[]).map((row) => {
    const { l4_hit, amount_usd_cached, codes_concat, documents, procurement_files, ...rest } = row;
    return {
      ...rest, match_score: Number(row.match_score || 0), reco_score: Number(row.reco_score || 0),
      reco_reasons: buildRecoReasons(row, nowSec), agency: null, organization: null, source_url: null,
      unspsc_codes: [], core_locked: true,
      breakdown_file_count: normalizeDocumentRows(documents, procurement_files).length,
    };
  });

  // ── 卡片国际化按需翻译：异步写入缓存，不阻塞当前响应 ──
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

  return {
    items: resultItems,
    total: Number((countRows as RowDataPacket[])[0]?.total || 0), page, pageSize, variant,
  };
}
