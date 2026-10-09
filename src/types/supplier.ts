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
  /**
   * 行业面标准口径主标签码（crm_industry_nodes.code，UGT-I- 前缀）。
   * 有码 ⇒ industryZh/En 来自权威树（非中文界面拿到 ISIC 官方英文名）；
   * 无码 ⇒ 两列回落 supplier.industry 自由文本（此时 industryEn 仍是原文，不假装翻译）。
   */
  industryCode?: string;
  /** 自填行业原文（supplier.industry）：与标准口径不是同一个东西，详情页可并列展示 */
  industryText?: string;
  /** 标准口径路径名（门类 → 大类 → 中类 → 主码所在层），与 industryCode 同进同出 */
  industryPathZh?: string[];
  industryPathEn?: string[];
  /** 多行业标签（crm_supplier_industry_rel，主码在前，最多 3 个） */
  industryTags?: Array<{ code: string; nameZh: string; nameEn: string }>;
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
