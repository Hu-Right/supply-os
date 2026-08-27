/**
 * 公告解锁数据访问层
 * Notice Unlock Repository
 *
 * @module server/repos/notices/notice-unlock.repo
 * @description 操作 crm_opportunity_unlocks + crm_user_entitlements 表。
 */
import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

export class NoticeUnlockRepo {
  constructor(private pool: Pool) {}

  /** 用户公告解锁流水（仅公告，按解锁时间倒序） */
  async listNoticeUnlocks(userKey: string): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query(
      "SELECT notice_id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id IS NOT NULL ORDER BY unlocked_at DESC",
      [userKey],
    );
    return rows as RowDataPacket[];
  }

  /** 已有解锁记录（幂等判定，无记录返回 null） */
  async findExistingUnlock(userKey: string, noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
      [userKey, noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 用户对公告的解锁记录（详情解锁校验，与 findExistingUnlock 同义） */
  async findUnlock(userKey: string, noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
      [userKey, noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 写入解锁流水 */
  async insertUnlock(params: {
    userKey: string;
    noticeId: number;
    unlockType: string;
    price: number;
    unspscSnapshot: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_opportunity_unlocks
        (user_id, user_key, notice_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, NOW(), ?)`,
      [params.userKey, params.userKey, params.noticeId, params.unlockType, params.price, params.unspscSnapshot],
    );
  }

  /** 消耗一份付费配额（配额不足或权益已升级时不更新） */
  async consumeEntitlement(entitlementId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_user_entitlements SET quota_used = quota_used + 1, updated_at = NOW() WHERE id = ? AND quota_total > quota_used AND is_upgraded = 0",
      [entitlementId],
    );
  }
}
