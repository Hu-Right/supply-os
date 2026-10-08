/**
 * 供应商认领数据访问层
 * Supplier Claim Repository
 *
 * @module server/repos/suppliers/supplier-claim.repo
 * @description 操作 crm_supplier_claims 表：供应商认领流程。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export class SupplierClaimRepo {
  constructor(private pool: Pool) {}

  /** 提交供应商认领（立即临时绑定），返回自增 id。联系方式已随 2026-09-29 简化废弃（账号即联系方式），置 NULL */
  async insertClaim(params: {
    userId: number;
    supplierId: number;
    expiresAt: string; // DATETIME 字符串
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_supplier_claims
        (user_id, supplier_id, contact_name, contact_phone, status, expires_at)
       VALUES (?, ?, NULL, NULL, 'pending', ?)`,
      [
        params.userId, params.supplierId, params.expiresAt,
      ],
    );
    return Number((result as RowDataPacket).insertId);
  }

  /**
   * 执照已落库（企业信息保存成功）→ 把该用户对该主体的 pending 认领续期到审核窗口。
   * 双时钟设计：创建时 1 小时（限时上传执照），执照落库即续 7 天（管理员审核期）。
   */
  async extendPendingClaimExpiry(userId: number, supplierId: number, expiresAt: string): Promise<void> {
    await this.pool.execute(
      `UPDATE crm_supplier_claims SET expires_at = ?
       WHERE user_id = ? AND supplier_id = ? AND status = 'pending'`,
      [expiresAt, userId, supplierId],
    );
  }

  /**
   * 查询某用户对某供应商的【有效】认领记录（最新一条）。
   * 仅 pending/approved 算有效：rejected/expired 是终态，不应阻断用户重新认领。
   */
  async findByUserAndSupplier(userId: number, supplierId: number): Promise<{
    id: number; status: string; created_at: string | null; expires_at: string | null;
  } | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id, status, created_at, expires_at FROM crm_supplier_claims
       WHERE user_id = ? AND supplier_id = ? AND status IN ('pending', 'approved')
       ORDER BY id DESC LIMIT 1`,
      [userId, supplierId],
    );
    if (!rows[0]) return null;
    return {
      id: Number(rows[0].id),
      status: String(rows[0].status || "pending"),
      created_at: rows[0].created_at ? String(rows[0].created_at) : null,
      expires_at: rows[0].expires_at ? String(rows[0].expires_at) : null,
    };
  }

}
