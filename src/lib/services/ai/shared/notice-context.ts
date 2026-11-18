/**
 * AI 管线共享层：公告上下文获取
 * @module lib/services/ai/shared/notice-context
 * @description ai-score 与 ai-match 共用的"公告基础信息 + 机会资格条件"查询。
 *              此前同一份 SQL 在两个服务各持一份，收敛后评分/匹配/后续增强
 *              （历史中标注入、竞争分析）只改这一处。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { WIDE_LIMITS } from "@/lib/utils/notice-field-limits";

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
            LEFT(n.description, ${WIDE_LIMITS.description}) AS description
     FROM bid_notices n WHERE n.id = ? LIMIT 1`,
    [noticeId],
  );
  const base = (rows as RowDataPacket[])[0];
  if (!base) return null;

  // 资格条件：构建器已把商机的拆解文本投影进服务表（notice-public/build.ts），
  // 展示侧只读 notice_public，不再回查商机表（商机是上游，public 才是门户读源）。
  const [pubRows] = await pool.query(
    `SELECT p.eligibility, p.technical_hurdles, p.supplier_conditions
     FROM notice_public p
     WHERE p.notice_pk = ?
     LIMIT 1`,
    [noticeId],
  );
  const pub = (pubRows as RowDataPacket[])[0];
  return {
    ...(base as Record<string, unknown>),
    eligibility: String(pub?.eligibility || ""),
    technical_hurdles: String(pub?.technical_hurdles || ""),
    supplier_conditions: String(pub?.supplier_conditions || ""),
  } as NoticeContext;
}
