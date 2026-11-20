/**
 * 平台公告守护登记与对账（platform_notice_guard，平替 rfq_guard）
 *
 * @module lib/services/rfq-guard
 * @description 跨系统契约哨兵：外部爬虫同步（intelligence-daily syncRunner）与平台自营公告共用
 *              bid_notices 的自增 id 空间，靠后台「platform 行不覆盖」护栏保护。护栏一旦被
 *              移除，平台行会被爬虫按主键静默改写/消失、无告警。本服务在 supply-os 独占表
 *              platform_notice_guard 里登记每条平台行的预期归属与**预期类型码**（按发布方式
 *              映射：RFQ/ITB/RFP/EOI），并周期对账主表，检出「登记在册但主行已非 platform/
 *              预期类型/同 owner」的偏差——即护栏失效信号。登记表爬虫永不触碰，故为可靠「预期真相」。
 *
 *              口径：撤回（withdraw）仅置 rfq_status=closed、不删行，主行仍是 platform/原类型，
 *              故无需销账；对账只针对「被改写/被删/类型漂移」这一真实异常路径。
 *
 *              历史：原名 rfq_guard（类型码硬编码 RFQ）。P1a 方式脊柱改造后平台行可投多种
 *              类型码，改用 platform_notice_guard（迁移 066 新建，rfq_guard 生产 0 行），
 *              原表不做 DDL、留待退役流程。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface PlatformNoticeGuardRef {
  noticeId: number;
  reference: string;
  userId: number | null;
  expectedNoticeType: string;
}

export interface PlatformNoticeViolation {
  noticeId: number;
  reference: string;
  expectUserId: number | null;
  expectedNoticeType: string;
  curSource: string | null;
  curType: string | null;
  curUserId: number | null;
}

/**
 * 登记一条平台公告的预期归属与预期类型码（发布时与投影同事务调用）。
 * 幂等 upsert：同 notice_id 重复登记刷新 reference/user/type（重启/补偿安全）。
 */
export async function registerPlatformNoticeGuard(dbPool: Pool, ref: PlatformNoticeGuardRef): Promise<void> {
  await dbPool.query(
    `INSERT INTO platform_notice_guard (notice_id, reference, user_id, expected_notice_type)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reference = VALUES(reference), user_id = VALUES(user_id),
       expected_notice_type = VALUES(expected_notice_type)`,
    [ref.noticeId, ref.reference, ref.userId, ref.expectedNoticeType],
  );
}

/**
 * 对账：检出登记表在册、但主表已不符（消失 / 被改写为非 platform / 类型码漂移 / 归属变更）的行。
 * @returns checked 登记表总条数；violations 偏差明细（curSource/curType/curUserId 为 null 表示主行已不存在）
 */
export async function reconcilePlatformNoticeGuard(
  dbPool: Pool,
): Promise<{ checked: number; violations: PlatformNoticeViolation[] }> {
  const [countRows] = await dbPool.query(`SELECT COUNT(*) AS total FROM platform_notice_guard`);
  const checked = Number((countRows as RowDataPacket[])[0]?.total || 0);

  const [rows] = await dbPool.query(
    `SELECT g.notice_id AS noticeId, g.reference AS reference, g.user_id AS expectUserId,
            g.expected_notice_type AS expectedNoticeType,
            n.entry_source AS curSource, n.notice_type AS curType, n.user_id AS curUserId
       FROM platform_notice_guard g
       LEFT JOIN bid_notices n ON n.id = g.notice_id
      WHERE n.id IS NULL
         OR n.entry_source <> 'platform'
         OR n.notice_type <> g.expected_notice_type
         OR NOT (n.user_id <=> g.user_id)`,
  );
  const violations = (rows as RowDataPacket[]).map((r) => ({
    noticeId: Number(r.noticeId),
    reference: String(r.reference ?? ""),
    expectUserId: r.expectUserId == null ? null : Number(r.expectUserId),
    expectedNoticeType: String(r.expectedNoticeType ?? ""),
    curSource: r.curSource == null ? null : String(r.curSource),
    curType: r.curType == null ? null : String(r.curType),
    curUserId: r.curUserId == null ? null : Number(r.curUserId),
  }));

  return { checked, violations };
}
