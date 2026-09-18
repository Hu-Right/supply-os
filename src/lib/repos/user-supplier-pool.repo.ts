/**
 * 用户供应商资源库数据访问层
 * @module lib/repos/user-supplier-pool.repo
 * @description crm_user_supplier_pool 表 CRUD + JOIN 查询。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface PoolSupplierItem {
  pool_id: number;
  supplier_id: number | null;
  qualification_id: number | null;
  company: string;
  industry: string;
  has_qualification: number;
  notes: string | null;
  source: string;
  created_at: string;
}

export class UserSupplierPoolRepo {
  constructor(private pool: Pool) {}

  /** 列出用户资源库（JOIN supplier 获取公司名和行业） */
  async listByUser(userId: number): Promise<PoolSupplierItem[]> {
    const [rows] = await this.pool.query(
      `SELECT p.id AS pool_id, p.supplier_id, p.qualification_id,
              COALESCE(s.company, '') AS company,
              COALESCE(s.industry, '') AS industry,
              CASE WHEN q.id IS NOT NULL THEN 1 ELSE 0 END AS has_qualification,
              p.notes, p.source, p.created_at
       FROM crm_user_supplier_pool p
       LEFT JOIN supplier s ON s.id = p.supplier_id
       LEFT JOIN crm_supplier_qualification q ON q.id = p.qualification_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [userId],
    );
    return (rows as RowDataPacket[]) as PoolSupplierItem[];
  }

  /** 从平台目录添加（supplier_id 有值） */
  async addFromPlatform(userId: number, supplierId: number, qualificationId: number | null): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT IGNORE INTO crm_user_supplier_pool (user_id, supplier_id, qualification_id, source)
       VALUES (?, ?, ?, 'platform')`,
      [userId, supplierId, qualificationId],
    );
    return Number((result as any).insertId ?? 0);
  }

  /** 手动添加（supplier_id 有值，指向新创建的 supplier 记录） */
  async addManual(userId: number, supplierId: number): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_user_supplier_pool (user_id, supplier_id, source)
       VALUES (?, ?, 'manual')`,
      [userId, supplierId],
    );
    return Number((result as any).insertId ?? 0);
  }

  /** 更新备注 */
  async updateNotes(userId: number, poolId: number, notes: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_user_supplier_pool SET notes = ? WHERE id = ? AND user_id = ?",
      [notes, poolId, userId],
    );
  }

  /** 删除记录 */
  async remove(userId: number, poolId: number): Promise<void> {
    await this.pool.execute(
      "DELETE FROM crm_user_supplier_pool WHERE id = ? AND user_id = ?",
      [poolId, userId],
    );
  }

  /** 统计用户资源库数量 */
  async countByUser(userId: number): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT COUNT(*) AS cnt FROM crm_user_supplier_pool WHERE user_id = ?",
      [userId],
    );
    return Number((rows as RowDataPacket[])[0]?.cnt ?? 0);
  }

  /** 回写诊断记录关联 */
  async linkQualification(userId: number, poolId: number, qualificationId: number): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_user_supplier_pool SET qualification_id = ? WHERE id = ? AND user_id = ?",
      [qualificationId, poolId, userId],
    );
  }

  /** 获取资源库中供应商的完整画像（用于 AI 匹配） */
  async fetchSupplierProfiles(userId: number): Promise<Record<string, unknown>[]> {
    const [rows] = await this.pool.query(
      `SELECT p.id AS pool_id, s.id AS supplier_id,
              s.company, s.industry, s.products, s.certification,
              s.country, s.city, s.type, s.registered_capital, s.established_at, s.intro,
              q.employee_count, q.export_scale, q.service_countries,
              q.overseas_companies, q.ungm_status, q.english_team,
              q.payment_terms, q.bid_willingness
       FROM crm_user_supplier_pool p
       INNER JOIN supplier s ON s.id = p.supplier_id
       LEFT JOIN crm_supplier_qualification q ON q.id = p.qualification_id
       WHERE p.user_id = ? AND p.supplier_id IS NOT NULL`,
      [userId],
    );
    return rows as Record<string, unknown>[];
  }
}
