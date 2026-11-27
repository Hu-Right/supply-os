/**
 * 账号注销申请仓储
 *
 * @module lib/repos/account-deletion.repo
 * @description 只做「申请单」的存取；停用账号/吊销会话/匿名化由服务层执行。
 *              状态：pending（待核验）/ cooling（冷静期）/ processing（处理中）/
 *                    done（已注销）/ rejected（已拒绝）/ cancelled（冷静期内撤销）。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type AccountDeletionStatus =
  | "pending"
  | "cooling"
  | "processing"
  | "done"
  | "rejected"
  | "cancelled";

export interface AccountDeletionRequestRow extends RowDataPacket {
  id: number;
  user_id: number;
  identifier: string;
  reason: string | null;
  contact: string | null;
  status: AccountDeletionStatus;
  cooling_until: string | null;
  blockers: string | null;
  handled_by: string | null;
  handled_note: string | null;
  notified_at: string | null;
  notified_channel: string | null;
  created_at: string;
  updated_at: string;
}

/** 仍在流程中的状态（用于去重） */
const ACTIVE_STATUSES = ["pending", "cooling", "processing"] as const;

export class AccountDeletionRepo {
  constructor(private pool: Pool) {}

  /** 已有进行中的申请则复用，避免重复建单 */
  async findActive(userId: number): Promise<AccountDeletionRequestRow | null> {
    const [rows] = await this.pool.query<AccountDeletionRequestRow[]>(
      `SELECT * FROM account_deletion_requests
        WHERE user_id = ? AND status IN (?)
        ORDER BY id DESC LIMIT 1`,
      [userId, ACTIVE_STATUSES],
    );
    return rows[0] ?? null;
  }

  async create(input: {
    userId: number;
    identifier: string;
    reason: string | null;
    contact: string | null;
    coolingUntil: Date | null;
    blockers: string[];
  }): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO account_deletion_requests
         (user_id, identifier, reason, contact, status, cooling_until, blockers)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.identifier,
        input.reason,
        input.contact,
        input.coolingUntil ? "cooling" : "pending",
        input.coolingUntil,
        input.blockers.length ? JSON.stringify(input.blockers) : null,
      ],
    );
    return Number(result.insertId);
  }

  async latest(userId: number): Promise<AccountDeletionRequestRow | null> {
    const [rows] = await this.pool.query<AccountDeletionRequestRow[]>(
      `SELECT * FROM account_deletion_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  async markHandled(
    id: number,
    status: "done" | "rejected",
    handledBy: string,
    note: string | null,
  ): Promise<void> {
    await this.pool.execute(
      `UPDATE account_deletion_requests
          SET status = ?, handled_by = ?, handled_note = ?
        WHERE id = ?`,
      [status, handledBy, note, id],
    );
  }

  /** 冷静期内用户重新登录 → 撤销申请 */
  async cancelCooling(userId: number, note: string): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE account_deletion_requests
          SET status = 'cancelled', handled_note = ?
        WHERE user_id = ? AND status = 'cooling' AND (notified_at IS NULL)`,
      [note, userId],
    );
    return Number(result.affectedRows ?? 0);
  }

  /** 冷静期已到期、等待执行的申请 */
  async listCoolingDue(limit = 20): Promise<AccountDeletionRequestRow[]> {
    const [rows] = await this.pool.query<AccountDeletionRequestRow[]>(
      `SELECT * FROM account_deletion_requests
        WHERE status = 'cooling' AND cooling_until IS NOT NULL AND cooling_until <= NOW()
        ORDER BY id ASC LIMIT ?`,
      [limit],
    );
    return rows;
  }

  /** 待通知的结果单 */
  async listUnnotified(limit = 50): Promise<AccountDeletionRequestRow[]> {
    const [rows] = await this.pool.query<AccountDeletionRequestRow[]>(
      `SELECT * FROM account_deletion_requests
        WHERE status IN ('done', 'rejected')
          AND notified_at IS NULL
          AND identifier <> ''
        ORDER BY id ASC LIMIT ?`,
      [limit],
    );
    return rows;
  }

  async markNotified(id: number, channel: string): Promise<void> {
    await this.pool.execute(
      `UPDATE account_deletion_requests
          SET notified_at = NOW(), notified_channel = ?
        WHERE id = ? AND notified_at IS NULL`,
      [channel, id],
    );
  }
}
