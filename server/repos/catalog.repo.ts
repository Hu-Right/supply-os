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
   *  多策略搜索回退：
   *    策略1: 完整关键词 LIKE 匹配（title_zh + title）
   *    策略2: 中文输入拆分为单字符，要求全部字符均出现在 title_zh（AND 语义）
   *    策略3: 单字符 OR 匹配，按匹配字符数排序（降级模糊匹配）
   *    策略4: 英文 title 小写关键词匹配
   *  每级均优先 L4/L5 精确类目。
   */
  async smartInferUnspsc(q: string): Promise<SmartInferResult | null> {
    const matched = await this.multiStrategySearch(q);
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

  /** 多策略搜索：逐级回退直到找到匹配类目 */
  private async multiStrategySearch(q: string): Promise<UnspscRow | null> {
    const like = `%${q}%`;

    // 策略 1：完整关键词 LIKE 匹配（title_zh 或 title）
    const [r1] = await this.pool.query(
      `SELECT id, title_zh, title, code, parent_id, level
       FROM crm_unspsc_codes
       WHERE title_zh LIKE ? OR title LIKE ?
       ORDER BY FIELD(level, 4, 5, 3, 2, 1), CHAR_LENGTH(code) DESC
       LIMIT 5`,
      [like, like],
    );
    if ((r1 as UnspscRow[]).length > 0) return (r1 as UnspscRow[])[0];

    // 提取中文字符用于后续策略（排除空格、标点、ASCII）
    const chars = [...new Set(q.replace(/[\s\x00-\x7F]/g, ""))].filter(Boolean);
    if (chars.length === 0) return null;

    // 策略 2：所有字符均出现在 title_zh（AND 语义）——适合"钢铁"→"不锈钢合金"类匹配
    const allCharClauses = chars.map(() => "title_zh LIKE ?").join(" AND ");
    const allCharParams = chars.map((c) => `%${c}%`);
    const [r2] = await this.pool.query(
      `SELECT id, title_zh, title, code, parent_id, level
       FROM crm_unspsc_codes
       WHERE ${allCharClauses}
       ORDER BY FIELD(level, 4, 5, 3, 2, 1), CHAR_LENGTH(code) DESC
       LIMIT 5`,
      allCharParams,
    );
    if ((r2 as UnspscRow[]).length > 0) return (r2 as UnspscRow[])[0];

    // 策略 3：至少一个字符匹配（OR 语义），按匹配字符数降序排列
    const anyCharClauses = chars.map(() => "title_zh LIKE ?").join(" OR ");
    const scoreExpr = chars.map(() => "(title_zh LIKE ?)").join(" + ");
    const anyCharParams = chars.map((c) => `%${c}%`);
    const scoreParams = chars.map((c) => `%${c}%`);
    const [r3] = await this.pool.query(
      `SELECT id, title_zh, title, code, parent_id, level,
              (${scoreExpr}) AS matched_chars
       FROM crm_unspsc_codes
       WHERE ${anyCharClauses}
       ORDER BY matched_chars DESC, FIELD(level, 4, 5, 3, 2, 1), CHAR_LENGTH(code) DESC
       LIMIT 5`,
      [...anyCharParams, ...scoreParams],
    );
    if ((r3 as UnspscRow[]).length > 0) return (r3 as UnspscRow[])[0];

    // 策略 4：英文 title 小写匹配
    const qLower = q.toLowerCase();
    const [r4] = await this.pool.query(
      `SELECT id, title_zh, title, code, parent_id, level
       FROM crm_unspsc_codes
       WHERE LOWER(title) LIKE ?
       ORDER BY FIELD(level, 4, 5, 3, 2, 1), CHAR_LENGTH(code) DESC
       LIMIT 5`,
      [`%${qLower}%`],
    );
    if ((r4 as UnspscRow[]).length > 0) return (r4 as UnspscRow[])[0];

    return null;
  }
}
