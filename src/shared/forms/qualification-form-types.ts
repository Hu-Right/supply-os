/**
 * 企业资质诊断表单 — 类型、常量与字段元数据
 * Enterprise Qualification Form — Types & Constants
 *
 * @module shared/forms/qualification-form-types
 * @description 从 QualificationFormFields.tsx 提取的类型定义、初始值与字段元数据，
 *              供表单组件和各消费方共享。
 */

import type { QualOption } from "@/shared/data/qualificationOptions";

// ── 表单状态类型（与 crm_supplier_qualification 14 字段对齐） ──

export interface QualificationFormState {
  company_name: string;
  company_website: string;
  founding_year: string;
  employee_count: string;
  industry: string[];
  other_industry: string;
  main_product: string;
  export_scale: string;
  certifications: string[];
  other_certifications: string;
  service_countries: string;
  overseas_companies: string;
  ungm_status: string;
  english_team: string;
  payment_terms: string;
  bid_willingness: string;
  contact_info: string;
}

export const INITIAL_QUALIFICATION_FORM: QualificationFormState = {
  company_name: "",
  company_website: "",
  founding_year: "",
  employee_count: "",
  industry: [],
  other_industry: "",
  main_product: "",
  export_scale: "",
  certifications: [],
  other_certifications: "",
  service_countries: "",
  overseas_companies: "",
  ungm_status: "",
  english_team: "",
  payment_terms: "",
  bid_willingness: "",
  contact_info: "",
};

// ── 字段标签 key 常量（消费方按自身 i18n 体系映射文案） ──

export type QualFieldKey =
  | "companyName" | "companyWebsite" | "foundingYear" | "employeeCount"
  | "industry" | "mainProduct" | "exportScale" | "certifications"
  | "serviceCountries" | "overseasCompanies" | "ungmStatus" | "englishTeam"
  | "paymentTerms" | "bidWillingness";

/** 字段元数据：序号、key、是否必填 */
export const QUAL_FIELDS: Array<{ no: number; key: QualFieldKey; required: boolean }> = [
  { no: 1, key: "companyName", required: true },
  { no: 2, key: "companyWebsite", required: false },
  { no: 3, key: "foundingYear", required: false },
  { no: 4, key: "employeeCount", required: false },
  { no: 5, key: "industry", required: true },
  { no: 6, key: "mainProduct", required: true },
  { no: 7, key: "exportScale", required: true },
  { no: 8, key: "certifications", required: true },
  { no: 9, key: "serviceCountries", required: true },
  { no: 10, key: "overseasCompanies", required: true },
  { no: 11, key: "ungmStatus", required: true },
  { no: 12, key: "englishTeam", required: true },
  { no: 13, key: "paymentTerms", required: true },
  { no: 14, key: "bidWillingness", required: true },
];

/** placeholder key 映射 */
export const PLACEHOLDER_KEYS: Record<string, string> = {
  companyName: "qualEnterCompany",
  companyWebsite: "qualCompanyWebsite",
  foundingYear: "qualEnterYears",
  mainProduct: "qualEnterProduct",
  serviceCountries: "qualEnterCountries",
  overseasCompanies: "qualEnterCountries",
  otherIndustry: "qualOtherIndustry",
  otherCertifications: "qualOtherCertifications",
  contactInfo: "qualContactInfo",
};

/** 组件 Props 类型 */
export interface QualificationFormFieldsProps {
  form: QualificationFormState;
  update: <K extends keyof QualificationFormState>(key: K, val: QualificationFormState[K]) => void;
  toggleIndustry: (val: string) => void;
  toggleCert: (val: string) => void;
  /** 字段标签翻译：传入字段 key，返回显示文案 */
  label: (key: QualFieldKey) => string;
  /** placeholder 翻译：传入 placeholder key，返回显示文案 */
  placeholder?: (key: string) => string;
  /** 8 组选项（由消费方从 qualificationOptions 获取后传入） */
  options: {
    employee: QualOption[];
    industry: QualOption[];
    exportScale: QualOption[];
    cert: QualOption[];
    ungm: QualOption[];
    englishTeam: QualOption[];
    payment: QualOption[];
    bid: QualOption[];
  };
  /** 外层容器 className（默认卡片样式） */
  className?: string;
  /** 需要隐藏的字段（注册流程中部分字段已自动填充，无需用户手动填写） */
  hideFields?: QualFieldKey[];
}
