/**
 * 用户供应商资源库数据访问层
 * @module lib/repos/user-supplier-pool.repo
 * @description crm_user_supplier_pool 表 CRUD + JOIN 查询。
 */
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { diagnosisColumnSelect } from "@/shared/constants/diagnosis-dimensions";

/** 事务执行器：池或同一连接（事务内必须传连接，保证读写同会话） */
type Executor = Pool | PoolConnection;

export interface PoolSupplierItem {
  pool_id: number;
  supplier_id: number | null;
  company: string;
  industry: string;
  /** 是否已有 v2 诊断（按 user_id + supplier_id 自然键判定，不再依赖 pool.qualification_id 旧指针） */
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
      `SELECT p.id AS pool_id, p.supplier_id,
              COALESCE(s.company, '') AS company,
              COALESCE(s.industry, '') AS industry,
              CASE WHEN q.id IS NOT NULL THEN 1 ELSE 0 END AS has_qualification,
              p.notes, p.source, p.created_at
       FROM crm_user_supplier_pool p
       LEFT JOIN supplier s ON s.id = p.supplier_id
       LEFT JOIN crm_supplier_diagnosis q ON q.supplier_id = p.supplier_id AND q.user_id = p.user_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [userId],
    );
    return (rows as RowDataPacket[]) as PoolSupplierItem[];
  }

  /** 从平台目录添加（supplier_id 有值；conn 用于事务，下同）
   *  不再写 pool.qualification_id：v2 诊断按 (user_id, supplier_id) 自然键关联，
   *  旧列留着但恒为 NULL（库表列退役不 DROP，避免不可逆结构变更）。 */
  async addFromPlatform(userId: number, supplierId: number, conn?: PoolConnection): Promise<number> {
    const [result] = await this.exec(conn).execute(
      `INSERT IGNORE INTO crm_user_supplier_pool (user_id, supplier_id, source)
       VALUES (?, ?, 'platform')`,
      [userId, supplierId],
    );
    return Number((result as ResultSetHeader).insertId ?? 0);
  }

  /** 手动添加（supplier_id 有值，指向新创建的 supplier 记录） */
  async addManual(userId: number, supplierId: number, conn?: PoolConnection): Promise<number> {
    const [result] = await this.exec(conn).execute(
      `INSERT INTO crm_user_supplier_pool (user_id, supplier_id, source)
       VALUES (?, ?, 'manual')`,
      [userId, supplierId],
    );
    return Number((result as ResultSetHeader).insertId ?? 0);
  }

  /**
   * 创建 pending 基础供应商记录（仅 company，不进公共目录），返回新行 id
   *
   * ★ 时间列必须是 `addtime`（INT  unix 秒）而不是 `created_at`：2026-09-26 实测
   *   `supplier` 共 54 列且**不存在 created_at / updated_at**（INFORMATION_SCHEMA 与 SHOW COLUMNS
   *   双向对异，且 SELECT created_at 直接报 ER_BAD_FIELD_ERROR）——旧写法在这里会直接抛 1054，
   *   而调用方 supplier-pool.ts 只特判 ER_DUP_ENTRY，其余 throw → “往资源库添加一家目录里
   *   不存在的公司”整个功能 500（实库 crm_user_supplier_pool 行数 = 0，与“从未成功过”一致）。
   *   另：本表其余 NOT NULL 列均带默认值（已用事务内试写—回滚验证），因此只写三列合法。
   *   addtime 也是门户企业卡片“录入时间”真正读的那一列。
   */
  async createPendingSupplier(company: string, conn?: PoolConnection): Promise<number> {
    const [result] = await this.exec(conn).execute(
      "INSERT INTO supplier (company, verify_status, addtime) VALUES (?, 'pending', UNIX_TIMESTAMP())",
      [company],
    );
    return Number((result as ResultSetHeader).insertId ?? 0);
  }

  /** 按公司名查找平台目录中已认证的供应商（精确优先，其次模糊；LIKE 通配符已转义） */
  async findVerifiedByCompany(company: string): Promise<{ id: number; company: string; industry: string } | null> {
    const rows = await this.searchVerifiedByCompany(company, 1);
    return rows[0] ?? null;
  }

  /** 候选搜索：已认证供应商按名称模糊匹配，标记是否已在当前用户资源库中 */
  async searchVerifiedByCompany(
    keyword: string,
    limit = 8,
    userId?: number,
  ): Promise<Array<{ id: number; company: string; industry: string; in_pool: number }>> {
    const escaped = keyword.replace(/[\\%_]/g, "\\$&");
    const sql = `
      SELECT s.id, s.company, s.industry${userId ? ", (p.id IS NOT NULL) AS in_pool" : ", 0 AS in_pool"}
      FROM supplier s
      ${userId ? "LEFT JOIN crm_user_supplier_pool p ON p.supplier_id = s.id AND p.user_id = ?" : ""}
      WHERE s.company LIKE ? AND (s.verify_status = 'done' OR s.verify_status IS NULL)
      ORDER BY CHAR_LENGTH(s.company) ASC
      LIMIT ${Math.max(1, Math.min(20, Number(limit) || 8))}`;
    const params = userId ? [userId, `%${escaped}%`] : [`%${escaped}%`];
    const [rows] = await this.pool.query(sql, params);
    return (rows as RowDataPacket[]).map((r) => ({
      id: Number(r.id),
      company: String(r.company ?? ""),
      industry: String(r.industry ?? ""),
      in_pool: Number(r.in_pool ?? 0),
    }));
  }

  /** 按 id 查找已认证供应商（前端候选确认添加的校验入口） */
  async findVerifiedById(supplierId: number): Promise<{ id: number; company: string; industry: string } | null> {
    const [rows] = await this.pool.query(
      `SELECT id, company, industry FROM supplier
       WHERE id = ? AND (verify_status = 'done' OR verify_status IS NULL)
       LIMIT 1`,
      [supplierId],
    );
    const row = (rows as RowDataPacket[])[0];
    return row ? { id: Number(row.id), company: String(row.company ?? ""), industry: String(row.industry ?? "") } : null;
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

  /** 统计资源库中尚未做过 v2 诊断的工厂数（LEFT JOIN 落空即待完善），用于匹配结果页的补全提示 */
  async countDiagnosisPending(userId: number): Promise<number> {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS cnt
       FROM crm_user_supplier_pool p
       LEFT JOIN crm_supplier_diagnosis q ON q.supplier_id = p.supplier_id AND q.user_id = p.user_id
       WHERE p.user_id = ? AND p.supplier_id IS NOT NULL AND q.id IS NULL`,
      [userId],
    );
    return Number((rows as RowDataPacket[])[0]?.cnt ?? 0);
  }

  /** 获取资源库中供应商的完整画像（用于 AI 匹配）
   *  诊断列走与 ai/shared/supplier-profile 同一份 SSOT（diagnosisColumnSelect），
   *  两个取数口一旦列集漂移，候选工厂与自家企业的 LLM 评分就不再可比。 */
  async fetchSupplierProfiles(userId: number): Promise<Record<string, unknown>[]> {
    const [rows] = await this.pool.query(
      `SELECT p.id AS pool_id, s.id AS supplier_id,
              s.company, s.industry, s.products, s.certification,
              s.country, s.city, s.type, s.registered_capital, s.established_at, s.intro,
              ${diagnosisColumnSelect("q")}
       FROM crm_user_supplier_pool p
       INNER JOIN supplier s ON s.id = p.supplier_id
       LEFT JOIN crm_supplier_diagnosis q ON q.supplier_id = p.supplier_id AND q.user_id = p.user_id
       WHERE p.user_id = ? AND p.supplier_id IS NOT NULL`,
      [userId],
    );
    return rows as Record<string, unknown>[];
  }
}
