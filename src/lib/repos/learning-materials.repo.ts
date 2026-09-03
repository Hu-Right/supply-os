/**
 * 学习资料数据访问层
 * Learning Materials Repository
 *
 * @module repos/learning-materials.repo
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

/** 学习资料行 */
export interface LearningMaterialRow {
  id: number;
  material_id: string;
  title_zh: string;
  title_en: string;
  content_zh: string | null;
  content_en: string | null;
  category_zh: string;
  category_en: string;
  summary_zh: string;
  summary_en: string;
  price: number;
  file_url: string;
  file_name: string;
  downloads_count: number;
  is_premium: number;
  number: number;
  created_at: Date;
  updated_at: Date;
}

/** 打包套餐行 */
export interface LearningMaterialBundleRow {
  id: number;
  bundle_id: string;
  label_zh: string;
  label_en: string;
  price: number;
  material_ids: string; // JSON array string
  created_at: Date;
}

export class LearningMaterialsRepo {
  constructor(private pool: Pool) {}

  /** 获取全部学习资料（按 number 排序） */
  async findAll(): Promise<LearningMaterialRow[]> {
    const [rows] = await this.pool.query(
      `SELECT * FROM crm_learning_materials ORDER BY number ASC, id ASC`,
    );
    return rows as LearningMaterialRow[];
  }

  /** 按 material_id 获取单个资料 */
  async findByMaterialId(materialId: string): Promise<LearningMaterialRow | null> {
    const [rows] = await this.pool.query(
      `SELECT * FROM crm_learning_materials WHERE material_id = ? LIMIT 1`,
      [materialId],
    );
    return (rows as LearningMaterialRow[])[0] ?? null;
  }

  /** 批量按 material_id 获取资料 */
  async findByMaterialIds(materialIds: string[]): Promise<LearningMaterialRow[]> {
    if (materialIds.length === 0) return [];
    const placeholders = materialIds.map(() => "?").join(",");
    const [rows] = await this.pool.query(
      `SELECT * FROM crm_learning_materials WHERE material_id IN (${placeholders}) ORDER BY number ASC`,
      materialIds,
    );
    return rows as LearningMaterialRow[];
  }

  /** 获取用户已购买的资料 material_id 列表 */
  async findPurchasedMaterialIds(userId: number): Promise<string[]> {
    const [rows] = await this.pool.query(
      `SELECT material_id FROM crm_learning_material_purchases WHERE user_id = ?`,
      [userId],
    );
    return (rows as RowDataPacket[]).map((r) => r.material_id as string);
  }

  /** 事务内：记录购买（幂等，ON DUPLICATE KEY UPDATE） */
  async recordPurchaseInTransaction(
    conn: PoolConnection,
    userId: number,
    materialId: string,
    orderNo: string,
    amount: number,
  ): Promise<void> {
    await conn.execute(
      `INSERT INTO crm_learning_material_purchases (user_id, material_id, order_no, amount)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE order_no = VALUES(order_no), amount = VALUES(amount)`,
      [userId, materialId, orderNo, amount],
    );
  }

  /** 事务内：批量记录购买（打包套餐） */
  async recordBundlePurchasesInTransaction(
    conn: PoolConnection,
    userId: number,
    materialIds: string[],
    orderNo: string,
    amount: number,
  ): Promise<void> {
    if (materialIds.length === 0) return;
    const perItemAmount = amount / materialIds.length;
    for (const materialId of materialIds) {
      await conn.execute(
        `INSERT INTO crm_learning_material_purchases (user_id, material_id, order_no, amount)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE order_no = VALUES(order_no), amount = VALUES(amount)`,
        [userId, materialId, orderNo, perItemAmount],
      );
    }
  }

  /** 事务内：递增下载次数 */
  async incrementDownloadCountInTransaction(
    conn: PoolConnection,
    materialId: string,
  ): Promise<void> {
    await conn.execute(
      `UPDATE crm_learning_materials SET downloads_count = downloads_count + 1 WHERE material_id = ?`,
      [materialId],
    );
  }
}
