/**
 * 供应商资质初筛 API（跨 feature 共享）
 * Supplier Qualification API (shared across features)
 *
 * @module shared/api/qualification
 * @description 从 features/procurement/api/qualification.ts 提升至 shared 层，
 *              消除 supplier → procurement 跨 feature 硬依赖。
 *              POST /api/supplier-qualification（无需登录，扫码直达；服务端限流 10 次/分钟）。
 */
import { api } from "@/core/http";

/** 初筛表单提交体（与 crm_supplier_qualification 表字段对齐） */
export interface SupplierQualificationForm {
  company_name: string;
  company_website: string;
  founding_year: string | null;
  employee_count: string | null;
  industry: string[];
  other_industry: string | null;
  main_product: string;
  export_scale: string;
  certifications: string[];
  other_certifications: string | null;
  service_countries: string;
  overseas_companies: string;
  ungm_status: string;
  english_team: string;
  payment_terms: string;
  bid_willingness: string;
  contact_info: string | null;
  /** 员工推广归因：ref_code Cookie 解析出的邀请码 */
  invitation_code?: string;
}

export const submitSupplierQualification = (data: SupplierQualificationForm) =>
  api<{ success: boolean; id: number; message: string }>("/api/supplier-qualification", {
    method: "POST",
    body: data as unknown as BodyInit,
  });
