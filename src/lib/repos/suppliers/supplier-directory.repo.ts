/**
 * 供应商目录数据访问层
 * Supplier Directory Repository
 *
 * @module server/repos/suppliers/supplier-directory.repo
 * @description 操作 supplier 外部表（只读）：目录列表、分页查询、联系方式。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { escapeLikeWildcard } from "../../utils/normalize";

/** 供应商目录行（supplier 表） */
export interface SupplierDirectoryRow {
  id: number;
  company: string | null;
  country: string | null;
  country_code: string | null;
  province: string | null;
  city: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  products: string | null;
  industry: string | null;
  type: string | null;
}

export class SupplierDirectoryRepo {
  constructor(private pool: Pool) {}

  /** 供应商目录（排除测试数据，最新 500 家） */
  async listDirectory(): Promise<SupplierDirectoryRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city, contact, phone, email, products, industry, type
       FROM supplier
       WHERE company <> '测试'
       ORDER BY id DESC
       LIMIT 500`,
    );
    return rows as SupplierDirectoryRow[];
  }

  /** 供应商目录分页查询（支持搜索、类型、行业筛选） */
  async listDirectoryPaginated(params: {
    limit: number;
    offset: number;
    lang: string;
    search?: string;
    type?: string;
    industry?: string;
  }): Promise<{ items: SupplierDirectoryRow[]; total: number }> {
    const { limit, offset, lang, search, type, industry } = params;

    // ── WHERE 条件构建 ──
    const conditions: string[] = ["company <> '测试'"];
    const values: any[] = [];

    if (search) {
      conditions.push("company LIKE ?");
      // L-BIZ-1 修复：转义用户输入中的 LIKE 通配符
      values.push(`%${escapeLikeWildcard(search)}%`);
    }

    if (type && (type === "domestic" || type === "international")) {
      conditions.push("type = ?");
      values.push(type);
    }

    if (industry) {
      // 非中文语言：优先匹配译文表，回退到原文列
      const translationLangs: Record<string, string> = {
        en: "English", fr: "French", ru: "Russian", es: "Spanish", ar: "Arabic",
      };
      if (lang !== "zh" && translationLangs[lang]) {
        conditions.push(
          `(COALESCE((SELECT industry_tr FROM crm_supplier_translations WHERE supplier_id = supplier.id AND lang = ? LIMIT 1), industry) = ?)`,
        );
        values.push(translationLangs[lang], industry);
      } else {
        conditions.push("industry = ?");
        values.push(industry);
      }
    }

    const whereSql = conditions.join(" AND ");

    // 总数查询
    const [countRows] = await this.pool.query(
      `SELECT COUNT(*) as total FROM supplier WHERE ${whereSql}`,
      values,
    );
    const total = (countRows as any[])[0]?.total ?? 0;

    // 分页数据查询
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city, contact, phone, email, products, industry, type
       FROM supplier
       WHERE ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );

    return { items: rows as SupplierDirectoryRow[], total };
  }

  /** 供应商明文联系方式（VIP 端点） */
  async findContact(supplierId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT contact, phone, email FROM supplier WHERE id = ? LIMIT 1",
      [supplierId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }
}
