/**
 * 公告交互数据访问层
 * Notice Interaction Repository
 *
 * @module server/repos/notices/notice-interaction.repo
 * @description 操作 crm_user_notice_views + crm_notice_interests 表。
 */
import type { Pool } from "mysql2/promise";

export class NoticeInteractionRepo {
  constructor(private pool: Pool) {}

  /** 记录公告浏览流水 */
  async insertView(params: { userId: number; noticeId: number; ip: string }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_user_notice_views (user_id, notice_id, viewed_at, ip)
       VALUES (?, ?, NOW(), ?)`,
      [params.userId, params.noticeId, params.ip],
    );
  }

  /** 公告意向 upsert（详情页来源） */
  async upsertInterest(params: {
    userId: number;
    noticeId: number;
    interestType: string;
    note: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_notice_interests (user_id, notice_id, interest_type, source, note)
       VALUES (?, ?, ?, 'detail_page', ?)
       ON DUPLICATE KEY UPDATE note = VALUES(note), updated_at = NOW()`,
      [params.userId, params.noticeId, params.interestType, params.note],
    );
  }
}
