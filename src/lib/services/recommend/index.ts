/**
 * 公采推荐服务 — 编排入口
 * Notice recommendation orchestrator
 *
 * @module server/services/recommend
 * @description 基于用户兴趣码（90 天半衰期衰减）的召回 + 加权评分推荐，
 *              含权重画像 A/B、金额偏好、解锁关键词文本加分与 MMR 去重；
 *              无兴趣信号时回退按截止时间排序。
 */
import type { Pool, QueryResult, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import {
  recomputeRecoWeightProfile,
} from "./weight-profile";
import {
  recoVariant,
} from "./ab-testing";
import {
  tokenizeNoticeText, jaccardTokenSim, S_TEXT_BONUS, getUserUnlockKeywords,
} from "./text-similarity";
import { backfillNoticeAmountCache } from "../amount/index";
import { deadlineFallback, processInterestCodes } from "./recall";
import { buildScoringContext, getAmountPreference, resolveWeights } from "./scoring";
import { mmrRerankPage, buildRecoReasons } from "./rerank";
import { ACTIVE_NOTICE_WHERE, DEADLINE_SEC_EXPR } from "../../utils/notice-expired";
// N7 收敛（2026-08-20）：normalizeNoticeType 直连 utils/notice-type 权威端口
import { normalizeNoticeType } from "../../utils/notice-type";
import { CACHE_TTL_STANDARD_MS } from "@/shared/constants/time";
const DEPTH_FACTOR: Record<number, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 };

// 推荐结果缓存
const recoResultCache = new Map<string, { data: NoticeRecommendResult; expires: number }>();
const RECO_RESULT_CACHE_TTL = CACHE_TTL_STANDARD_MS;
const RECO_RESULT_CACHE_MAX = 200;

export interface NoticeRecommendResult {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  variant?: string;
  fallback?: string;
}

/**
 * 推荐主入口。
 * 架构约束：推荐链路只读已有译文缓存，绝不触发翻译请求。
 * 译文生产统一收敛到详情页按需翻译。
 */
export async function recommendNotices(
  pool: Pool, userId: number, page: number, pageSize: number,
  locale?: string,
): Promise<NoticeRecommendResult> {
  const offset = (page - 1) * pageSize;
  if (!userId) return deadlineFallback(pool, page, pageSize, offset, locale);

  // 缓存命中检查
  const recoCacheKey = `${userId}:${page}:${pageSize}:${locale || ""}`;
  const cachedReco = recoResultCache.get(recoCacheKey);
  if (cachedReco && cachedReco.expires > Date.now()) return cachedReco.data;

  // ── 召回：兴趣码衰减查询 ──
  const [interestRows] = await pool.query(
    `SELECT code, level, MAX(code_id) AS code_id,
            SUM(weight * EXP(-LN(2) * GREATEST(0, DATEDIFF(NOW(), COALESCE(updated_at, created_at))) / 90)) AS decayed_weight,
            MAX(COALESCE(updated_at, created_at)) AS last_update
     FROM crm_user_interest_codes WHERE user_id = ?
     GROUP BY code, level ORDER BY decayed_weight DESC, last_update DESC LIMIT 80`,
    [userId],
  );

  const { scoredNodes, clauses, interestTotal, misses } = await processInterestCodes(
    pool, interestRows as RowDataPacket[], DEPTH_FACTOR,
  );
  if (misses.length > 0) {
    // 换不出落点的码不静默丢：它们只会让该用户少一类召回，不报错所以必须自己点名
    console.warn(
      `[recommend] user=${userId} ${misses.length}/${(interestRows as RowDataPacket[]).length} 个兴趣码在骨架树上换不出落点，样本 ${misses.slice(0, 3).join("、")}`,
    );
  }
  // 没有任何可用落点（无兴趣码 / 全换不出 / 只有 L1 落点）→ 降级按截止时间排序
  if (clauses.join === "") return deadlineFallback(pool, page, pageSize, offset, locale);

  // ── 评分上下文：COUNT + 权重画像并行 ──
  const variant = recoVariant(userId);
  const [countResult, profileResult] = await Promise.all([
    pool.query(
      // 候选集计数：与主查询同一个 JOIN、同一批参数。形状是「先按公告分组、外面数分组数」
      // 而不是 COUNT(DISTINCT n.id)：倒排读法上 DISTINCT 会把优化器带去选错索引
      // （实测同一条句子 9.3s vs FORCE INDEX 3.2s，探针108）。
      `SELECT COUNT(*) AS total FROM (
         SELECT n.id FROM crm_bid_notices n
         ${clauses.join}
         WHERE ${ACTIVE_NOTICE_WHERE}
         GROUP BY n.id
       ) t`,
      clauses.params,
    ),
    pool.query(
      `SELECT w_unspsc, w_agency, w_amount, w_geo, w_urgency, updated_at FROM crm_reco_weight_profile WHERE user_id = ? LIMIT 1`,
      [userId],
    ),
  ]);
  const [countRows] = countResult;
  const [profileRows] = profileResult;
  const profileRow = (profileRows as RowDataPacket[])[0] || null;

  const { wUnspsc, wUrgency, wAmount, wNeutral, profileStale } = resolveWeights(profileRow, variant);
  if (profileStale) void recomputeRecoWeightProfile(pool, userId).catch(() => undefined);

  // 金额偏好
  const { centerLog: amountCenterLog, active: amountActive } = await getAmountPreference(pool, userId);

  // 构建评分表达式
  const scoring = buildScoringContext(scoredNodes, interestTotal, wUnspsc, wUrgency, wAmount, wNeutral, amountCenterLog, amountActive);

  // ── 主查询 ──
  // 三个 JOIN 各管一件事，都不能合：cand（节点码倒排表）把候选集从 67 万收窄到千级；
  // ns（宽表）只给打分提供该公告自己的完整节点码路径（压集后的深层落点不在 cand 行里，
  // 拿 cand 打分会静默归零，见 scoring.ts 那段）；b（码桥表）只出两件与口径无关的东西
  // —— MMR 去重用的公告码集（codes_concat）与返回给前端的 match_score（该公告挂了几条码）。
  // 绑定顺序必须跟 SQL 文本里 ? 的出现顺序一致（mysql2 是按位置拼值的）：
  // SELECT 里的打分参数 → cand JOIN 的节点码 → trJoin 的语种 → LIMIT/OFFSET。
  // 上一版把 trParams 拼在第一个，传了 locale 的请求里语种串就被绑到打分位上：
  // MAX(cand.node = 'zh') 永远是 0，兴趣分整块静默归零（排序退化成只看截止/金额），
  // 而搜索链路默认就传 locale —— 这一条由 index.param-order 那组单测钉住。
  const trJoin = locale ? "LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?" : "";
  const trParams = locale ? [locale] : [];
  const treJoin = "LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  const oppJoin = "LEFT JOIN crm_bid_opportunities opp_desc ON opp_desc.source_notice_id = n.notice_id AND (opp_desc.is_qualified = 1 OR opp_desc.status = 1 OR opp_desc.audit_status = 1)";
  const trSelect = locale ? "tr.title_tr AS title_i18n, tr.description_tr AS description_i18n," : "";
  const treSelect = "tre.title_tr AS title_en, tre.description_tr AS description_en,";

  let rows: QueryResult;
  try {
    [rows] = await pool.query(
      `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
         n.deadline, n.deadline_ts, n.estimated_value, n.agency, n.is_featured,
         LEFT(MAX(opp_desc.description), 300) AS description,
         CASE WHEN LENGTH(MAX(opp_desc.description)) > 300 THEN 1 ELSE 0 END AS description_truncated, n.documents, n.procurement_files,
         ${trSelect} ${treSelect} MAX(opp_desc.description_cn) AS description_cn,
         LEFT(MAX(opp_desc.bid_overview), 200) AS bid_overview,
         MAX(opp_desc.beneficiary_countries) AS beneficiary_countries,
         ${scoring.l4HitExpr} AS l4_hit, MAX(amc.amount_usd) AS amount_usd_cached,
         GROUP_CONCAT(DISTINCT b.code) AS codes_concat,
         COUNT(DISTINCT b.code) AS match_score, ${scoring.recoScoreExpr} AS reco_score
       FROM crm_bid_notices n
       ${clauses.join}
       INNER JOIN crm_notice_search ns ON ns.id = n.id
       INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
       LEFT JOIN crm_notice_amount_cache amc ON amc.notice_id = n.id
       ${trJoin}
       ${treJoin}
       ${oppJoin}
       WHERE ${ACTIVE_NOTICE_WHERE}
       GROUP BY n.id ORDER BY reco_score DESC, (n.deadline_sec = 0), ${DEADLINE_SEC_EXPR}, n.id DESC
       LIMIT ? OFFSET ?`,
      [
        ...scoring.l4Params, ...scoring.scoreParams, scoring.denominator, ...scoring.amountScoreParams,
        ...clauses.params, ...trParams, pageSize, offset,
      ],
    );
  } catch (err) {
    console.error("[recommendNotices] main query failed, falling back to deadline:", err);
    return deadlineFallback(pool, page, pageSize, offset, locale);
  }

  // ── 后处理 ──
  const pageNoticeIds = (rows as RowDataPacket[]).map((row) => Number(row.id)).filter(Boolean);
  if (pageNoticeIds.length) void backfillNoticeAmountCache(pool, pageNoticeIds).catch(() => undefined);

  // 解锁关键词文本相似度加分
  const unlockKeywords = await getUserUnlockKeywords(pool, userId);
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
      // Suministros BUG 修复：主表 notice_type 含西班牙语等源数据脏值（如
      // "SuministrosAdquisición"），搜索路径读宽表 notice_type_std 已归一化，
      // 推荐路径直取原始值导致前端徽章原样展示外语脏值——此处复用与宽表
      // 同口径的 normalizeNoticeType 对齐（脏值归 OTHER，前端展示 i18n“其他”）
      ...rest, notice_type: normalizeNoticeType(row.notice_type as string | null | undefined),
      match_score: Number(row.match_score || 0), reco_score: Number(row.reco_score || 0),
      reco_reasons: buildRecoReasons(row, nowSec), organization: null, source_url: null,
      unspsc_codes: [], core_locked: true,
      breakdown_file_count: normalizeDocumentRows(documents, procurement_files).length,
    };
  });

  // 列表译文仅从已有缓存读取（trJoin），不触发任何翻译请求。
  // 译文生产统一收敛到定时任务（auto.ts）与详情页按需翻译两条路径。

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

// ── 子模块导出（供外部直接导入） ──
export { decayUserInterestCodes } from "./interest-decay";
export { recomputeRecoWeightProfile } from "./weight-profile";
export { AB_TREATMENT_PCT, recoVariant } from "./ab-testing";
export { tokenizeNoticeText, jaccardTokenSim, S_TEXT_BONUS, getUserUnlockKeywords } from "./text-similarity";
