/**
 * 公告详情页的「商机附加产物」读取（公告展示唯一读源 = 服务表）
 *
 * @module lib/services/notice-public/opportunity-extras
 * @description 2026-11-18 读取口径收口：公告展示（列表/搜索/详情/摘要）一律读服务表
 *              notice_public（notice_pk = bid_notices.id）。本模块只负责少数**服务表没有**
 *              的商机产物，避免详情端点为了几个字段回查整行商机（33 列）：
 *
 *                - `bid_overview`：拆标概览，宽表 notice_search.bid_overview 有（宽表 id = notice_pk）
 *                - `description_other` / `ai_products` / `ai_analysis`：商机独有，服务表与宽表都没有
 *
 *              因此这里仍 LEFT JOIN 商机表，但只取这 3 列 + 一个 id 用于「报告是否可下载」的判定，
 *              不再回读 title / description / 资格条件等**已被服务表归一**的重复字段。
 *              商机 JOIN 沿用合格谓词（utils/notice-qualified），与付费报告的可下载口径保持一致。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { qualifiedOppWhere } from "../../utils/notice-qualified";

export interface NoticeOpportunityExtras {
  /** 合格商机 id；null = 该公告没有可出报告的商机 */
  opportunityId: number | null;
  /** 拆标概览（宽表 notice_search.bid_overview） */
  bidOverview: string;
  descriptionOther: string;
  aiProducts: unknown;
  aiAnalysis: unknown;
}

const EMPTY: NoticeOpportunityExtras = {
  opportunityId: null,
  bidOverview: "",
  descriptionOther: "",
  aiProducts: null,
  aiAnalysis: null,
};

/**
 * 按公告主键（notice_pk = bid_notices.id）取详情页需要的商机附加产物。
 * 公告不在服务表时返回 null（调用方按「无附加产物」处理）。
 */
export async function findNoticeOpportunityExtras(
  pool: Pool,
  noticePk: number,
): Promise<NoticeOpportunityExtras | null> {
  if (!Number.isFinite(noticePk) || noticePk <= 0) return null;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.bid_overview,
            o.id AS opportunity_id, o.description_other, o.ai_products, o.ai_analysis
       FROM notice_public p
       LEFT JOIN notice_search s ON s.id = p.notice_pk
       LEFT JOIN bid_opportunities o
         ON o.source_notice_id = p.notice_id
        AND ${qualifiedOppWhere("o")}
      WHERE p.notice_pk = ?
      ORDER BY o.id DESC
      LIMIT 1`,
    [noticePk],
  );

  const row = rows[0];
  if (!row) return null;

  const oppId = Number(row.opportunity_id ?? 0);
  return {
    ...EMPTY,
    opportunityId: oppId > 0 ? oppId : null,
    bidOverview: String(row.bid_overview ?? "").trim(),
    descriptionOther: String(row.description_other ?? "").trim(),
    aiProducts: row.ai_products ?? null,
    aiAnalysis: row.ai_analysis ?? null,
  };
}