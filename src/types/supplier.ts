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
  ungmCode?: string;
  mainProductsZh: string[];
  mainProductsEn: string[];
  complianceLabelsZh: string[];
  complianceLabelsEn: string[];
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  status: "approved" | "pending" | "rejected";
  /** 会员等级标签（认证会员/金牌会员/推荐） */
  membershipTier?: "certified" | "gold" | "recommended";
  /** 资料完整度百分比 (0-100) */
  dataCompleteness?: number;
  /** UNSPSC 编码 */
  unspscCode?: string;
  /** 能力标签（准时交付 98%、24h响应等） */
  capabilityTags?: string[];
  /** 企业认证（ISO 9001, CE, TÜV 等） */
  certifications?: string[];
  /** 公司图片 URL */
  imageUrl?: string;
  /** 企业类型标签（工厂/贸易商） */
  companyType?: "factory" | "trader";
}
