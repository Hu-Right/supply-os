/**
 * AI 管线共享层：公告上下文获取
 * @module lib/services/ai/shared/notice-context
 * @description ai-score 与 ai-match 共用的"公告基础信息 + 机会资格条件"查询。
 *              此前同一份 SQL 在两个服务各持一份，收敛后评分/匹配/后续增强
 *              （历史中标注入、竞争分析）只改这一处。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/** 公告上下文（description 截断 2000 字，供匹配粗筛做词项匹配，不直接进 LLM prompt） */
export interface NoticeContext {
  id: number;
  title: string;
  notice_type: string;
  country: string;
  deadline: unknown;
  estimated_value: unknown;
  description: string | null;
  eligibility: string;
  technical_hurdles: string;
  supplier_conditions: string;
}

export async function fetchNoticeContext(pool: Pool, noticeId: number): Promise<NoticeContext | null> {
  const [rows] = await pool.query(
    `SELECT n.id, n.title, n.notice_type, n.country, n.deadline, n.estimated_value,
            LEFT(n.description, 2000) AS description
     FROM crm_bid_notices n WHERE n.id = ? LIMIT 1`,
    [noticeId],
  );
  const base = (rows as RowDataPacket[])[0];
  if (!base) return null;

  // 机会表补充资格条件
  const [oppRows] = await pool.query(
    `SELECT o.eligibility, o.technical_hurdles, o.supplier_conditions
     FROM crm_bid_opportunities o
     WHERE o.source_notice_id = (SELECT notice_id FROM crm_bid_notices WHERE id = ? LIMIT 1)
       AND (o.is_qualified = 1 OR o.status = 1 OR o.audit_status = 1)
     LIMIT 1`,
    [noticeId],
  );
  const opp = (oppRows as RowDataPacket[])[0];
  return {
    ...(base as Record<string, unknown>),
    eligibility: String(opp?.eligibility || ""),
    technical_hurdles: String(opp?.technical_hurdles || ""),
    supplier_conditions: String(opp?.supplier_conditions || ""),
  } as NoticeContext;
}
