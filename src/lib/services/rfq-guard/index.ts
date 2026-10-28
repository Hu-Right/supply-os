/**
 * 平台 RFQ 守护登记与对账
 *
 * @module lib/services/rfq-guard
 * @description 跨系统契约哨兵：外部爬虫同步（intelligence-daily syncRunner）与平台 RFQ 共用
 *              bid_notices 的自增 id 空间，靠后台「platform 行不覆盖」护栏保护。护栏一旦被
 *              移除，RFQ 会被爬虫按主键静默改写/消失、无告警。本服务在 supply-os 独占表
 *              rfq_guard 里登记每条 RFQ 的预期归属，并周期对账主表，检出「登记在册但主行
 *              已非 platform/RFQ/同 owner」的偏差——即护栏失效信号。登记表爬虫永不触碰，故为可靠「预期真相」。
 *
 *              口径：撤回（withdraw）仅置 rfq_status=closed、不删行，主行仍是 platform/RFQ，
 *              故无需销账；对账只针对「被改写/被删」这一真实异常路径。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface RfqGuardRef {
  rfqId: number;
  reference: string;
  userId: number | null;
}

export interface RfqGuardViolation {
  rfqId: number;
  reference: string;
  expectUserId: number | null;
  curSource: string | null;
  curType: string | null;
  curUserId: number | null;
}

/**
 * 登记一条平台 RFQ 的预期归属（create 后调用）。
 * 幂等 upsert：同 rfq_id 重复登记刷新 reference/user（重启/补偿安全）。
 */
export async function registerRfqGuard(dbPool: Pool, ref: RfqGuardRef): Promise<void> {
  await dbPool.query(
    `INSERT INTO rfq_guard (rfq_id, reference, user_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE reference = VALUES(reference), user_id = VALUES(user_id)`,
    [ref.rfqId, ref.reference, ref.userId],
  );
}

/**
 * 对账：检出登记表在册、但主表已不符（消失 / 被改写为非 platform / 非 RFQ / 归属变更）的行。
 * @returns checked 登记表总条数；violations 偏差明细（curSource/curType/curUserId 为 null 表示主行已不存在）
 */
export async function reconcileRfqGuard(
  dbPool: Pool,
): Promise<{ checked: number; violations: RfqGuardViolation[] }> {
  const [countRows] = await dbPool.query(`SELECT COUNT(*) AS total FROM rfq_guard`);
  const checked = Number((countRows as RowDataPacket[])[0]?.total || 0);

  const [rows] = await dbPool.query(
    `SELECT g.rfq_id AS rfqId, g.reference AS reference, g.user_id AS expectUserId,
            n.entry_source AS curSource, n.notice_type AS curType, n.user_id AS curUserId
       FROM rfq_guard g
       LEFT JOIN bid_notices n ON n.id = g.rfq_id
      WHERE n.id IS NULL
         OR n.entry_source <> 'platform'
         OR n.notice_type <> 'RFQ'
         OR NOT (n.user_id <=> g.user_id)`,
  );
  const violations = (rows as RowDataPacket[]).map((r) => ({
    rfqId: Number(r.rfqId),
    reference: String(r.reference ?? ""),
    expectUserId: r.expectUserId == null ? null : Number(r.expectUserId),
    curSource: r.curSource == null ? null : String(r.curSource),
    curType: r.curType == null ? null : String(r.curType),
    curUserId: r.curUserId == null ? null : Number(r.curUserId),
  }));

  return { checked, violations };
}
