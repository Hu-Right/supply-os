/**
 * 供应商国际招投标能力初筛仓储
 * Supplier Qualification Repository
 *
 * @module server/repos/supplier-qualification.repo
 * @description 初筛表单落库的 SQL 唯一出口（自 routes/supplier-qualification 上移，
 *              协议层不再直接持有 dbPool.execute，与其余域 Repo 模式对齐）。
 */
import type { Pool, ResultSetHeader } from "mysql2/promise";

/** 初筛表单提交数据（路由层已完成必填校验与归一化） */
export interface SupplierQualificationInput {
  company_name: string;
  company_website: string;
  founding_year: string | null;
  employee_count: string | null;
  industry: string;
  other_industry: string | null;
  main_product: string;
  export_scale: string;
  certifications: string;
  other_certifications: string | null;
  service_countries: string;
  overseas_companies: string;
  ungm_status: string;
  english_team: string;
  payment_terms: string;
  bid_willingness: string;
  contact_info: string | null;
  ip: string;
}

export class SupplierQualificationRepo {
  constructor(private readonly pool: Pool) {}

  /** 插入初筛申请，返回自增 id */
  async insertQualification(data: SupplierQualificationInput): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_supplier_qualification
        (company_name, company_website, founding_year, employee_count, industry, other_industry,
         main_product, export_scale, certifications, other_certifications,
         service_countries, overseas_companies, ungm_status, english_team,
         payment_terms, bid_willingness, contact_info, audit_status, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
      [
        data.company_name,
        data.company_website,
        data.founding_year,
        data.employee_count,
        data.industry,
        data.other_industry,
        data.main_product,
        data.export_scale,
        data.certifications,
        data.other_certifications,
        data.service_countries,
        data.overseas_companies,
        data.ungm_status,
        data.english_team,
        data.payment_terms,
        data.bid_willingness,
        data.contact_info,
        data.ip,
      ],
    );
    return Number((result as ResultSetHeader).insertId);
  }
}
