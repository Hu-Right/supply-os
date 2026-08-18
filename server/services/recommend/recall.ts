/**
 * 推荐召回层
 * Recommendation recall: interest-code SQL recall + deadline fallback
 *
 * @module server/services/recommend/recall
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import { ACTIVE_NOTICE_WHERE, DEADLINE_SEC_EXPR } from "../../utils/notice-expired";

export interface RecallResult {
  prefix: string;
  weighted: number;
}

export interface RecallClauses {
  bridgeWhere: string;
  params: any[];
}

/** 截断 UNSPSC 码尾部冗余 "00" 段，得到有效显著前缀 */
export function significantPrefix(code: string): string {
  let s = code;
  while (s.length > 2 && s.length % 2 === 0 && s.endsWith("00")) s = s.slice(0, -2);
  return s;
}

/**
 * 解析兴趣码行，生成加权前缀列表 + 召回 SQL 子句
 */
export function processInterestCodes(
  interestRows: RowDataPacket[],
  depthFactor: Record<number, number>,
): { scoredCodes: RecallResult[]; clauses: RecallClauses; interestTotal: number } {
  const scoredCodes: RecallResult[] = [];
  let interestTotal = 0;
  const recallIdsByLevel: Record<number, number[]> = { 2: [], 3: [], 4: [], 5: [] };
  const recallLikePrefixes = new Set<string>();

  for (const row of interestRows) {
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
    scoredCodes.push({ prefix, weighted: decayed * (depthFactor[depth] ?? 1.0) });
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

  const bridgeWhere = clauses.map((c) => `(${c})`).join(" OR ");
  return { scoredCodes, clauses: { bridgeWhere, params }, interestTotal };
}

/**
 * 截止时间降级：无兴趣信号或召回为空时，按截止时间排序返回。
 * 列表译文仅从已有缓存读取（trJoin），不触发任何翻译请求。
 */
export async function deadlineFallback(
  pool: Pool, page: number, pageSize: number, offset: number,
  locale?: string,
): Promise<{ items: any[]; total: number; page: number; pageSize: number; fallback: string }> {
  const [cntRows] = await pool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE}`);
  const cntRow = (cntRows as RowDataPacket[])[0];
  const trJoin = locale ? "LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?" : "";
  const trParams = locale ? [locale] : [];
  const treJoin = "LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  const trSelect = locale ? "tr.title_tr AS title_i18n, tr.description_tr AS description_i18n," : "";
  const treSelect = "tre.title_tr AS title_en, tre.description_tr AS description_en,";
  const oppSubPrefix = "(SELECT opp.";
  const oppSubWhere = " FROM crm_bid_opportunities opp WHERE opp.source_notice_id = n.notice_id AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1) LIMIT 1)";
  const descCnSub = `${oppSubPrefix}description_cn${oppSubWhere} AS description_cn`;
  const bidOverviewSub = `${oppSubPrefix}bid_overview${oppSubWhere} AS bid_overview`;
  const beneficiarySub = `${oppSubPrefix}beneficiary_countries${oppSubWhere} AS beneficiary_countries`;
  const [fallbackRows] = await pool.query(
    `SELECT DISTINCT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
            n.deadline, n.deadline_ts, n.deadline_sec, n.estimated_value, n.agency, n.is_featured,
            LEFT(n.description, 300) AS description, n.documents, n.procurement_files,
            ${trSelect} ${treSelect} ${descCnSub}, ${bidOverviewSub}, ${beneficiarySub}
     FROM crm_bid_notices n ${trJoin} ${treJoin} WHERE ${ACTIVE_NOTICE_WHERE} ORDER BY ${DEADLINE_SEC_EXPR} DESC LIMIT ? OFFSET ?`, [...trParams, pageSize, offset]);
  const fallbackItems = (fallbackRows as RowDataPacket[]).map(row => ({
    ...row, match_score: 0, reco_score: 0, organization: null, source_url: null,
    unspsc_codes: [], core_locked: true,
    breakdown_file_count: normalizeDocumentRows(row.documents, row.procurement_files).length,
    documents: undefined, procurement_files: undefined,
  }));

  // 列表译文仅从已有缓存读取（trJoin），不触发任何翻译请求。
  // 译文生产统一收敛到定时任务（auto.ts）与详情页按需翻译两条路径。

  return {
    items: fallbackItems,
    total: Number((cntRow as RowDataPacket).total), page, pageSize, fallback: "deadline",
  };
}
