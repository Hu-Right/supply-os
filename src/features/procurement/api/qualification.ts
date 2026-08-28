/**
 * 供应商国际招投标能力初筛表单 API
 * Supplier Qualification Form API
 *
 * @module features/procurement/api/qualification
 * @description POST /api/supplier-qualification（无需登录，扫码直达；服务端限流 10 次/分钟）。
 *              原页面内裸 fetch 收敛至此，统一走 core/http（Bearer 注入 / 错误归一 / 性能埋点）。
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
}

export const submitSupplierQualification = (data: SupplierQualificationForm) =>
  api<{ success: boolean; id: number; message: string }>("/api/supplier-qualification", {
    method: "POST",
    body: data as unknown as BodyInit,
  });
