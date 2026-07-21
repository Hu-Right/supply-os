/**
 * 供应商目录类型
 * Supplier Directory Types
 *
 * @module types/supplier
 * @description 供应商实体，支持国内/国际分类、中英文双语、合规标签、联系方式及审批状态
 *              Supplier entity with domestic/international classification, bilingual fields, compliance labels, and approval status
 */

export interface Supplier {
  id: string;
  nameZh: string;
  nameEn: string;
  type: "domestic" | "international";
  industryZh: string;
  industryEn: string;
  countryZh: string;
  countryEn: string;
  cityZh: string;
  cityEn: string;
  国际公共采购Code?: string;
  ungmCode?: string;
  mainProductsZh: string[];
  mainProductsEn: string[];
  complianceLabelsZh: string[];
  complianceLabelsEn: string[];
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  status: "approved" | "pending" | "rejected";
}
