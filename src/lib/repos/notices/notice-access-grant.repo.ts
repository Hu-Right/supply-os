/**
 * 公告解锁数据访问层
 * Notice Unlock Repository
 *
 * @module server/repos/notices/notice-access-grant.repo
 * @description 只操作 notice_access_grants 表（解锁流水：访问授权与审计明细）。
 *              额度记账已迁移至 benefit_quotas（唯一扣减口径见 lib/services/access-quota.ts），
 *              本 repo 不再读写旧表 crm_user_entitlements。
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

/** 解锁流水行（DB 列形状，只能给服务层读；对外视图见 lib/services/notice-service.ts） */
export interface NoticeAccessGrantRow {
  notice_id: number;
  grant_type: string | null;
  granted_at: Date | string | null;
}

export class NoticeAccessGrantRepo {
  constructor(private pool: Pool) {}

  /** 用户公告解锁流水（仅公告，按解锁时间倒序） */
  async listNoticeGrants(userId: number): Promise<NoticeAccessGrantRow[]> {
    const [rows] = await this.pool.query(
      "SELECT notice_id, grant_type, granted_at FROM notice_access_grants WHERE user_id = ? AND notice_id IS NOT NULL ORDER BY granted_at DESC",
      [userId],
    );
    return rows as NoticeAccessGrantRow[];
  }

  /** 已有解锁记录（幂等判定，无记录返回 null） */
  async findExistingGrant(userId: number, noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id FROM notice_access_grants WHERE user_id = ? AND notice_id = ? LIMIT 1",
      [userId, noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 用户对公告的解锁记录（详情解锁校验，与 findExistingGrant 同义） */
  async findGrant(userId: number, noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, grant_type, granted_at FROM notice_access_grants WHERE user_id = ? AND notice_id = ? LIMIT 1",
      [userId, noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  // ── 事务感知方法（供 executeGrant 服务层编排使用）──

  /** 事务内检查已有解锁记录（悲观锁路径，防止并发重复解锁） */
  async findExistingGrantInTransaction(
    conn: PoolConnection, userId: number, noticeId: number,
  ): Promise<RowDataPacket | null> {
    const [rows] = await conn.query(
      "SELECT id FROM notice_access_grants WHERE user_id = ? AND notice_id = ? LIMIT 1",
      [userId, noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 事务内写入解锁流水 */
  async insertGrantInTransaction(
    conn: PoolConnection,
    params: { userId: number; noticeId: number; grantType: string; price: number },
  ): Promise<void> {
    await conn.query(
      `INSERT INTO notice_access_grants
        (user_id, notice_id, grant_type, price, granted_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [params.userId, params.noticeId, params.grantType, params.price],
    );
  }
}
