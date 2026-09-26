/**
 * 产品关键词组数据访问层
 * Keyword Groups Repository
 *
 * @module lib/repos/keyword-groups.repo
 * @description 操作 crm_product_keyword_groups 表（迁移 101）：用户私有词组，
 *              terms 为 JSON 字符串数组；所有查询 user_id 隔离（越权不可能）。
 */
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

export interface KeywordGroupRow {
  id: number;
  name: string;
  terms: string[];
  createdAt: string;
  updatedAt: string;
}

export class KeywordGroupsRepo {
  constructor(private pool: Pool) {}

  async listByUser(userId: number): Promise<KeywordGroupRow[]> {
    const [rows] = await this.pool.query(
      "SELECT id, name, terms, created_at, updated_at FROM crm_product_keyword_groups WHERE user_id = ? ORDER BY id DESC",
      [userId],
    );
    return (rows as RowDataPacket[]).map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      terms: typeof r.terms === "string" ? (JSON.parse(r.terms) as string[]) : ((r.terms as string[]) ?? []),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  /** 新建；UNIQUE(user_id,name) 冲突返回 null（而非抛错） */
  async create(userId: number, name: string, terms: string[]): Promise<{ id: number } | null> {
    try {
      const [res] = await this.pool.execute(
        "INSERT INTO crm_product_keyword_groups (user_id, name, terms) VALUES (?, ?, ?)",
        [userId, name, JSON.stringify(terms)],
      );
      return { id: Number((res as ResultSetHeader).insertId) };
    } catch (err) {
      if ((err as { code?: string })?.code === "ER_DUP_ENTRY") return null;
      throw err;
    }
  }

  async update(userId: number, id: number, patch: { name?: string; terms?: string[] }): Promise<boolean> {
    const sets: string[] = [];
    // ExecuteValues 联合类型未从 mysql2/promise 导出，按实参口径收窄为 (string | number)[]
    const params: (string | number)[] = [];
    if (patch.name !== undefined) { sets.push("name = ?"); params.push(patch.name); }
    if (patch.terms !== undefined) { sets.push("terms = ?"); params.push(JSON.stringify(patch.terms)); }
    if (!sets.length) return true;
    params.push(userId, id);
    const [res] = await this.pool.execute(
      `UPDATE crm_product_keyword_groups SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`,
      params,
    );
    return Number((res as ResultSetHeader).affectedRows) > 0;
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.pool.execute(
      "DELETE FROM crm_product_keyword_groups WHERE user_id = ? AND id = ?",
      [userId, id],
    );
  }

  async countByUser(userId: number): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT COUNT(*) AS cnt FROM crm_product_keyword_groups WHERE user_id = ?",
      [userId],
    );
    return Number((rows as RowDataPacket[])[0]?.cnt || 0);
  }
}
