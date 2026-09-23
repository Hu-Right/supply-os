/**
 * 公告解锁数据访问层
 * Notice Unlock Repository
 *
 * @module server/repos/notices/notice-unlock.repo
 * @description 只操作 crm_opportunity_unlocks 表（解锁流水：访问授权与审计明细）。
 *              额度记账已迁移至 crm_benefit_quotas（唯一扣减口径见 lib/services/unlock-quota.ts），
 *              本 repo 不再读写旧表 crm_user_entitlements。
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

export class NoticeUnlockRepo {
  constructor(private pool: Pool) {}

  /** 用户公告解锁流水（仅公告，按解锁时间倒序） */
  async listNoticeUnlocks(userId: number): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query(
      "SELECT notice_id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_id = ? AND notice_id IS NOT NULL ORDER BY unlocked_at DESC",
      [userId],
    );
    return rows as RowDataPacket[];
  }

  /** 已有解锁记录（幂等判定，无记录返回 null） */
  async findExistingUnlock(userId: number, noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id FROM crm_opportunity_unlocks WHERE user_id = ? AND notice_id = ? LIMIT 1",
      [userId, noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 用户对公告的解锁记录（详情解锁校验，与 findExistingUnlock 同义） */
  async findUnlock(userId: number, noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_id = ? AND notice_id = ? LIMIT 1",
      [userId, noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 写入解锁流水 */
  async insertUnlock(params: {
    userId: number;
    noticeId: number;
    unlockType: string;
    price: number;
    unspscSnapshot: string;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_opportunity_unlocks
        (user_id, notice_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [params.userId, params.noticeId, params.unlockType, params.price, params.unspscSnapshot],
    );
  }

  // ── 事务感知方法（供 executeUnlock 服务层编排使用）──

  /** 事务内检查已有解锁记录（悲观锁路径，防止并发重复解锁） */
  async findExistingUnlockInTransaction(
    conn: PoolConnection, userId: number, noticeId: number,
  ): Promise<RowDataPacket | null> {
    const [rows] = await conn.query(
      "SELECT id FROM crm_opportunity_unlocks WHERE user_id = ? AND notice_id = ? LIMIT 1",
      [userId, noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 事务内写入解锁流水 */
  async insertUnlockInTransaction(
    conn: PoolConnection,
    params: { userId: number; noticeId: number; unlockType: string; price: number; unspscSnapshot: string },
  ): Promise<void> {
    await conn.query(
      `INSERT INTO crm_opportunity_unlocks
        (user_id, notice_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [params.userId, params.noticeId, params.unlockType, params.price, params.unspscSnapshot],
    );
  }
}
