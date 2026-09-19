/**
 * 用户供应商资源库数据访问层
 * @module lib/repos/user-supplier-pool.repo
 * @description crm_user_supplier_pool 表 CRUD + JOIN 查询。
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

/** 事务执行器：池或同一连接（事务内必须传连接，保证读写同会话） */
type Executor = Pool | PoolConnection;

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

  private exec(conn?: PoolConnection): Executor {
    return conn ?? this.pool;
  }

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

  /** 从平台目录添加（supplier_id 有值；conn 用于事务，下同） */
  async addFromPlatform(userId: number, supplierId: number, qualificationId: number | null, conn?: PoolConnection): Promise<number> {
    const [result] = await this.exec(conn).execute(
      `INSERT IGNORE INTO crm_user_supplier_pool (user_id, supplier_id, qualification_id, source)
       VALUES (?, ?, ?, 'platform')`,
      [userId, supplierId, qualificationId],
    );
    return Number((result as any).insertId ?? 0);
  }

  /** 手动添加（supplier_id 有值，指向新创建的 supplier 记录） */
  async addManual(userId: number, supplierId: number, conn?: PoolConnection): Promise<number> {
    const [result] = await this.exec(conn).execute(
      `INSERT INTO crm_user_supplier_pool (user_id, supplier_id, source)
       VALUES (?, ?, 'manual')`,
      [userId, supplierId],
    );
    return Number((result as any).insertId ?? 0);
  }

  /** 创建 pending 基础供应商记录（仅 company，不进公共目录），返回新行 id */
  async createPendingSupplier(company: string, conn?: PoolConnection): Promise<number> {
    const [result] = await this.exec(conn).execute(
      "INSERT INTO supplier (company, verify_status, created_at) VALUES (?, 'pending', NOW())",
      [company],
    );
    return Number((result as any).insertId ?? 0);
  }

  /** 按公司名查找平台目录中已认证的供应商（精确优先，其次模糊；LIKE 通配符已转义） */
  async findVerifiedByCompany(company: string): Promise<{ id: number; company: string; industry: string } | null> {
    const [exact] = await this.pool.query(
      `SELECT id, company, industry FROM supplier
       WHERE company = ? AND (verify_status = 'done' OR verify_status IS NULL)
       LIMIT 1`,
      [company],
    );
    if ((exact as RowDataPacket[]).length > 0) {
      const row = (exact as RowDataPacket[])[0];
      return { id: Number(row.id), company: String(row.company ?? ""), industry: String(row.industry ?? "") };
    }
    const escaped = company.replace(/[\\%_]/g, "\\$&");
    const [fuzzy] = await this.pool.query(
      `SELECT id, company, industry FROM supplier
       WHERE company LIKE ? AND (verify_status = 'done' OR verify_status IS NULL)
       ORDER BY CHAR_LENGTH(company) ASC LIMIT 1`,
      [`%${escaped}%`],
    );
    if ((fuzzy as RowDataPacket[]).length > 0) {
      const row = (fuzzy as RowDataPacket[])[0];
      return { id: Number(row.id), company: String(row.company ?? ""), industry: String(row.industry ?? "") };
    }
    return null;
  }

  /** 按公司名精确查找已有 pending 基础记录（手动添加去重复用，避免共享表堆积重复行） */
  async findPendingByExactCompany(company: string): Promise<{ id: number } | null> {
    const [rows] = await this.pool.query(
      `SELECT id FROM supplier WHERE company = ? AND verify_status = 'pending' ORDER BY id DESC LIMIT 1`,
      [company],
    );
    const row = (rows as RowDataPacket[])[0];
    return row ? { id: Number(row.id) } : null;
  }

  /** 查找供应商关联的最新一条诊断记录 id（经 crm_users.supplier_id 反查） */
  async findLatestQualificationId(supplierId: number): Promise<number | null> {
    const [rows] = await this.pool.query(
      `SELECT q.id FROM crm_supplier_qualification q
       INNER JOIN crm_users u ON u.id = q.user_id
       WHERE u.supplier_id = ?
       ORDER BY q.id DESC LIMIT 1`,
      [supplierId],
    );
    return (rows as RowDataPacket[])[0]?.id ?? null;
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

  /** 统计资源库中缺诊断资料的工厂数（LEFT JOIN 落空即待完善），用于匹配结果页的补全提示 */
  async countDiagnosisPending(userId: number): Promise<number> {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS cnt
       FROM crm_user_supplier_pool p
       LEFT JOIN crm_supplier_qualification q ON q.id = p.qualification_id
       WHERE p.user_id = ? AND p.supplier_id IS NOT NULL AND q.id IS NULL`,
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
