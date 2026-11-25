/**
 * 企业抬头检索（发票抬头自动补全税号）
 *
 * @module lib/services/billing/company-lookup
 * @description 数据源复用平台已有企业库：
 *              - supplier（供应商主体，company + credit_code，149k 条 USCC，前缀索引 idx_company）
 *              - procurement_buyers（采购主体，org_name + tax_no）
 *              只返回 18 位统一社会信用代码的企业，避免把境外注册号当税号带出。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

type CompanyRow = RowDataPacket & { title: string; taxNo: string }

export interface CompanyLookupItem {
  title: string;
  taxNo: string;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** 按企业名称检索（前缀匹配走索引；采购主体为包含匹配，量小） */
export async function searchCompanies(pool: Pool, keyword: string): Promise<CompanyLookupItem[]> {
  const kw = keyword.trim();
  if (kw.length < 2) return [];

  const prefix = `${escapeLike(kw)}%`;
  const [supplierRows] = await pool.query<CompanyRow[]>(
    `SELECT company AS title, credit_code AS taxNo
       FROM supplier
      WHERE company LIKE ?
        AND credit_code_type = 'uscc'
        AND CHAR_LENGTH(credit_code) = 18
        AND company IS NOT NULL AND company <> ''
      ORDER BY id DESC
      LIMIT 8`,
    [prefix],
  );

  const [buyerRows] = await pool.query<CompanyRow[]>(
    `SELECT org_name AS title, tax_no AS taxNo
       FROM procurement_buyers
      WHERE org_name LIKE ?
        AND tax_no IS NOT NULL AND tax_no <> ''
      ORDER BY updated_at DESC
      LIMIT 4`,
    [`%${escapeLike(kw)}%`],
  );

  const seen = new Set<string>();
  const items: CompanyLookupItem[] = [];
  for (const row of [...supplierRows, ...buyerRows]) {
    const title = String(row.title ?? "").trim();
    const taxNo = String(row.taxNo ?? "").trim().toUpperCase();
    if (!title || !taxNo || seen.has(taxNo)) continue;
    seen.add(taxNo);
    items.push({ title, taxNo });
    if (items.length >= 10) break;
  }
  return items;
}

/** 检索结果视图：只出 wire 白名单键（名称 + 税号） */
export function companyLookupViewOf(rows: CompanyLookupItem[]): CompanyLookupItem[] {
  return rows.map((r) => ({ title: String(r.title).trim(), taxNo: String(r.taxNo).trim().toUpperCase() }));
}

