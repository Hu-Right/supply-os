/**
 * RFQ 审核服务
 * @module lib/services/rfq/review
 * @description 管理端审核 RFQ 采购需求的业务逻辑（SQL 下沉，路由仅鉴权+编排）。
 *              打通「用户提交 → pending_review → 管理员审核 → published/rejected」链路，
 *              修复此前无任何接口能把 pending_review 变为 published、导致 RFQ 永远无法上架的断裂。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { RFQ_STATUS } from "@/shared/constants/rfq";

export type RfqReviewDecision = "approve" | "reject";

/**
 * 审核单个 RFQ：仅允许 pending_review → published(approve) / rejected(reject)。
 * WHERE 限定 notice_type='RFQ' 且当前为 pending_review，天然幂等且防误改非 RFQ 行。
 * @returns true=更新成功；false=目标不存在或不处于待审核状态
 */
export async function reviewRfq(pool: Pool, rfqId: number, decision: RfqReviewDecision): Promise<boolean> {
  const next = decision === "approve" ? RFQ_STATUS.PUBLISHED : RFQ_STATUS.REJECTED;
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE crm_bid_notices SET rfq_status = ?
     WHERE id = ? AND notice_type = 'RFQ' AND rfq_status = ?`,
    [next, rfqId, RFQ_STATUS.PENDING_REVIEW],
  );
  return result.affectedRows > 0;
}

/** 待审核 RFQ 列表（仅平台用户发布、处于 pending_review 的记录）。 */
export async function listPendingRfqs(pool: Pool, limit = 50): Promise<RowDataPacket[]> {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const [rows] = await pool.query(
    `SELECT id, title, country, province_name, user_id, deadline_sec, estimated_value, created_at
     FROM crm_bid_notices
     WHERE notice_type = 'RFQ' AND entry_source = 'platform' AND rfq_status = ?
     ORDER BY id DESC
     LIMIT ${safeLimit}`,
    [RFQ_STATUS.PENDING_REVIEW],
  );
  return rows as RowDataPacket[];
}
