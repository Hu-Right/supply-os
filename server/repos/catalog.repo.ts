/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 类目与认证数据访问层
 * Catalog Repository
 *
 * @module repos/catalog.repo
 */
import type { Pool } from "mysql2/promise";
import { getUnspscPath } from "../services/unspsc";

export interface CertificationRow {
  id: number;
  name: string;
}

export interface UnspscRow {
  id: number;
  title_zh: string | null;
  title: string | null;
  code: string | null;
  parent_id: number | null;
  level: number;
  title_i18n?: string | null;
}

export interface SmartInferResult {
  level1_id: number | null;
  level2_id: number | null;
  level3_id: number | null;
  level4_id: number | null;
  level5_id: number | null;
  matched_title: string | null;
}

export class CatalogRepo {
  constructor(private pool: Pool) {}

  /** 查询全部激活的供应商资质证书 */
  async listActiveCertifications(): Promise<CertificationRow[]> {
    const [rows] = await this.pool.query(
      "SELECT id, name FROM crm_supplier_certifications WHERE is_active = 1 ORDER BY sort_order",
    );
    return rows as CertificationRow[];
  }

  /** 查询 UNSPSC 层级（含译文缓存） */
  async listUnspscWithTranslation(sql: string, params: unknown[]): Promise<UnspscRow[]> {
    const [rows] = await this.pool.query(sql, params);
    return rows as UnspscRow[];
  }

  /** 批量写入 UNSPSC 译文缓存 */
  async upsertUnspscTranslations(
    entries: { codeId: number; lang: string; titleTr: string; model: string }[],
  ): Promise<void> {
    for (const entry of entries) {
      await this.pool.query(
        `INSERT INTO crm_unspsc_translations (code_id, lang, title_tr, model)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), model = VALUES(model)`,
        [entry.codeId, entry.lang, entry.titleTr, entry.model],
      );
    }
  }

  /** UNSPSC 关键词搜索 */
  async searchUnspsc(q: string): Promise<UnspscRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, title_zh, title, code, parent_id, level
       FROM crm_unspsc_codes
       WHERE code LIKE ? OR title_zh LIKE ? OR title LIKE ?
       ORDER BY level, code
       LIMIT 30`,
      [`${q}%`, `%${q}%`, `%${q}%`],
    );
    return rows as UnspscRow[];
  }

  /** 智能推断 UNSPSC 类目：输入关键词，返回最佳匹配的完整路径（L1→L5）。
   *  搜索策略：优先匹配 L4/L5 精确类目（更具体），回退到 L3/L2/L1。
   */
  async smartInferUnspsc(q: string): Promise<SmartInferResult | null> {
    const [rows] = await this.pool.query(
      `SELECT id, title_zh, title, code, parent_id, level
       FROM crm_unspsc_codes
       WHERE title_zh LIKE ? OR title LIKE ?
       ORDER BY FIELD(level, 4, 5, 3, 2, 1), CHAR_LENGTH(code) DESC
       LIMIT 5`,
      [`%${q}%`, `%${q}%`],
    );
    const matched = (rows as UnspscRow[])[0];
    if (!matched) return null;
    const path = await getUnspscPath(this.pool, matched.id);
    return {
      level1_id: path.level1_id,
      level2_id: path.level2_id,
      level3_id: path.level3_id,
      level4_id: path.level4_id,
      level5_id: path.level5_id,
      matched_title: matched.title_zh || matched.title || null,
    };
  }
}
