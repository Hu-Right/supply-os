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
  async insertView(params: { userKey: string; noticeId: number; ip: string }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_user_notice_views (user_id, user_key, notice_id, viewed_at, ip)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, NOW(), ?)`,
      [params.userKey, params.userKey, params.noticeId, params.ip],
    );
  }

  /** 公告意向 upsert（详情页来源） */
  async upsertInterest(params: {
    userKey: string;
    noticeId: number;
    interestType: string;
    note: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_notice_interests (user_id, user_key, notice_id, interest_type, source, note)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, 'detail_page', ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), note = VALUES(note), updated_at = NOW()`,
      [params.userKey, params.userKey, params.noticeId, params.interestType, params.note],
    );
  }
}
