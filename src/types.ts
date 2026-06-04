/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExhibitionHall {
  id: string;
  nameZh: string;
  nameEn: string;
  regionZh: string; // e.g. 亚洲, 欧洲, 非洲, 北美, 南美, 中东
  regionEn: string; // e.g. Asia, Europe, Africa, North America, South America, Middle East
  countryZh: string;
  countryEn: string;
  cityZh: string;
  cityEn: string;
  descriptionZh: string;
  descriptionEn: string;
  bannerUrl: string;
  featuredProductsZh: string[];
  featuredProductsEn: string[];
  capacityValue: string; // e.g., "5000㎡"
}

export interface Supplier {
  id: string;
  nameZh: string;
  nameEn: string;
  type: "domestic" | "international";
  industryZh: string; // e.g., 机械, 电子, 建材, 医疗, 化工, 家居
  industryEn: string; // e.g., Machinery, Electronics, Construction, Medical, Chemical, Home
  countryZh: string;
  countryEn: string;
  cityZh: string;
  cityEn: string;
  ungmCode?: string; // Optional for domestic, required for international
  mainProductsZh: string[];
  mainProductsEn: string[];
  complianceLabelsZh: string[];
  complianceLabelsEn: string[];
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  status: "approved" | "pending" | "rejected";
}

export interface Lead {
  id: string;
  companyName: string;
  country: string;
  city: string;
  contactPerson: string;
  contactMethod: string; // E.g., Phone / WhatsApp / Email
  email: string;
  industry: string;
  mainProducts: string;
  hasUngmParticipation: boolean;
  notes: string;
  type: "exhibition_register" | "supplier_register" | "consulting_advisor" | "requirement_submit" | "custom";
  status: "new" | "contacted" | "qualified" | "lost";
  createdAt: string;
  followUpLogs?: { date: string; content: string; author: string }[];
}

export interface Opportunity {
  id: string;
  titleZh: string;
  titleEn: string;
  industryZh: string;
  industryEn: string;
  countryZh: string;
  countryEn: string;
  budget: string;
  deadline: string;
  descriptionZh: string;
  descriptionEn: string;
  subscribersCount: number;
}

export interface LearningMaterial {
  id: string;
  titleZh: string;
  titleEn: string;
  categoryZh: string; // E.g., 政策解读, UNGM入驻, 参展指南
  categoryEn: string;
  summaryZh: string;
  summaryEn: string;
  contentZh: string;
  contentEn: string;
  isPremium: boolean; // Member-only
  downloadsCount: number;
}

export interface FAQItem {
  id: string;
  questionZh: string;
  questionEn: string;
  answerZh: string;
  answerEn: string;
  category: "ungm" | "exhibition" | "general";
}
