/**
 * 官方精选关键词组数据访问层（只读投影）
 * Official Keyword Groups Repository (read-only projection)
 *
 * @module lib/repos/official-keyword-groups.repo
 * @description 只读 crm_official_keyword_groups（后台维护，本项目无任何写路径）：
 *              terms 为 JSON 字符串数组；读侧只出 status=1，按 (sort_order,id) 升序，
 *              与 idx_status_sort 同源。列名 snake_case → 实体 camelCase 在本层 mapper
 *              完成（与 API 响应键名规范对齐）。表不存在时以 ER_NO_SUCH_TABLE 上抛——
 *              一切以表为准，不做容错兼容。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface OfficialKeywordGroupRow {
  id: number;
  name: string;
  terms: string[];
  categoryCode: string | null;
  sortOrder: number;
}

export class OfficialKeywordGroupsRepo {
  constructor(private pool: Pool) {}

  async listEnabled(): Promise<OfficialKeywordGroupRow[]> {
    const [rows] = await this.pool.query(
      "SELECT id, name, terms, category_code, sort_order FROM crm_official_keyword_groups WHERE `status` = 1 ORDER BY sort_order ASC, id ASC",
    );
    return (rows as RowDataPacket[]).map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      terms: typeof r.terms === "string" ? (JSON.parse(r.terms) as string[]) : ((r.terms as string[]) ?? []),
      categoryCode: r.category_code == null ? null : String(r.category_code),
      sortOrder: Number(r.sort_order),
    }));
  }

  /** 用户建组/改名的保留名校验：入参 trim 后精确匹配（口径同 validateGroupInput） */
  async isOfficialName(name: string): Promise<boolean> {
    const [rows] = await this.pool.query(
      "SELECT 1 AS hit FROM crm_official_keyword_groups WHERE `name` = ? LIMIT 1",
      [String(name ?? "").trim()],
    );
    return (rows as RowDataPacket[]).length > 0;
  }
}
