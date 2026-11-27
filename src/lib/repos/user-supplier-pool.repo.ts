/**
 * 用户供应商资源库数据访问层
 * @module lib/repos/user-supplier-pool.repo
 * @description user_supplier_pool 表 CRUD + JOIN 查询。
 */
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { attachCertificationText } from "./certification-text";
import { diagnosisColumnSelect } from "@/shared/constants/diagnosis-dimensions";

/** 事务执行器：池或同一连接（事务内必须传连接，保证读写同会话） */
type Executor = Pool | PoolConnection;

export interface PoolSupplierItem {
  pool_id: number;
  supplier_id: number | null;
  company: string;
  industry: string;
  /** 供应商信息审核状态：只有 reviewed 才有公开详情页（/supplier/{id}） */
  info_review_status: string;
  /** 是否已有 v2 诊断（按 user_id + supplier_id 自然键判定） */
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
              '' AS industry,
              COALESCE(s.info_review_status, '') AS info_review_status,
              CASE WHEN q.id IS NOT NULL THEN 1 ELSE 0 END AS has_qualification,
              p.notes, p.source, p.created_at
       FROM user_supplier_pool p
       LEFT JOIN supplier s ON s.id = p.supplier_id
       LEFT JOIN supplier_diagnosis q ON q.supplier_id = p.supplier_id AND q.user_id = p.user_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [userId],
    );
    return (rows as RowDataPacket[]) as PoolSupplierItem[];
  }

  /** 从平台目录添加（supplier_id 有值；conn 用于事务，下同） */
  async addFromPlatform(userId: number, supplierId: number, conn?: PoolConnection): Promise<number> {
    const [result] = await this.exec(conn).execute(
      `INSERT IGNORE INTO user_supplier_pool (user_id, supplier_id, source)
       VALUES (?, ?, 'platform')`,
      [userId, supplierId],
    );
    return Number((result as ResultSetHeader).insertId ?? 0);
  }

  /** 候选搜索：已认证供应商按名称模糊匹配，标记是否已在当前用户资源库中 */
  async searchVerifiedByCompany(
    keyword: string,
    limit = 8,
    userId?: number,
  ): Promise<Array<{ id: number; company: string; industry: string; in_pool: number }>> {
    const escaped = keyword.replace(/[\\%_]/g, "\\$&");
    const sql = `
      SELECT s.id, s.company${userId ? ", (p.id IS NOT NULL) AS in_pool" : ", 0 AS in_pool"}
      FROM supplier s
      ${userId ? "LEFT JOIN user_supplier_pool p ON p.supplier_id = s.id AND p.user_id = ?" : ""}
      WHERE s.company LIKE ? AND s.info_review_status = 'reviewed'
      ORDER BY CHAR_LENGTH(s.company) ASC
      LIMIT ${Math.max(1, Math.min(20, Number(limit) || 8))}`;
    const params = userId ? [userId, `%${escaped}%`] : [`%${escaped}%`];
    const [rows] = await this.pool.query(sql, params);
    return (rows as RowDataPacket[]).map((r) => ({
      id: Number(r.id),
      company: String(r.company ?? ""),
      industry: "",
      in_pool: Number(r.in_pool ?? 0),
    }));
  }

  /** 按 id 查找已认证供应商（前端候选确认添加的校验入口） */
  async findVerifiedById(supplierId: number): Promise<{ id: number; company: string; industry: string } | null> {
    const [rows] = await this.pool.query(
      `SELECT id, company FROM supplier
       WHERE id = ? AND info_review_status = 'reviewed'
       LIMIT 1`,
      [supplierId],
    );
    const row = (rows as RowDataPacket[])[0];
    return row ? { id: Number(row.id), company: String(row.company ?? ""), industry: "" } : null;
  }

  /** 更新备注 */
  async updateNotes(userId: number, poolId: number, notes: string): Promise<void> {
    await this.pool.execute(
      "UPDATE user_supplier_pool SET notes = ? WHERE id = ? AND user_id = ?",
      [notes, poolId, userId],
    );
  }

  /** 删除记录 */
  async remove(userId: number, poolId: number): Promise<void> {
    await this.pool.execute(
      "DELETE FROM user_supplier_pool WHERE id = ? AND user_id = ?",
      [poolId, userId],
    );
  }

  /** 统计用户资源库数量 */
  async countByUser(userId: number): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT COUNT(*) AS cnt FROM user_supplier_pool WHERE user_id = ?",
      [userId],
    );
    return Number((rows as RowDataPacket[])[0]?.cnt ?? 0);
  }

  /** 统计资源库中尚未做过 v2 诊断的工厂数（LEFT JOIN 落空即待完善），用于匹配结果页的补全提示 */
  async countDiagnosisPending(userId: number): Promise<number> {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS cnt
       FROM user_supplier_pool p
       LEFT JOIN supplier_diagnosis q ON q.supplier_id = p.supplier_id AND q.user_id = p.user_id
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
              s.company, s.products,
              s.country, s.city, s.registered_capital, s.established_at,
              ${diagnosisColumnSelect("q")}
       FROM user_supplier_pool p
       INNER JOIN supplier s ON s.id = p.supplier_id
       LEFT JOIN supplier_diagnosis q ON q.supplier_id = p.supplier_id AND q.user_id = p.user_id
       WHERE p.user_id = ? AND p.supplier_id IS NOT NULL`,
      [userId],
    );
    // 证书文本由能力档案批量装配（supplier.certification 已停写），供 AI 粗筛词项使用
    await attachCertificationText(this.pool, rows as Record<string, unknown>[], "supplier_id");
    return rows as Record<string, unknown>[];
  }
}
