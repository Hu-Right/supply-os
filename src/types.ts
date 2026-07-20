/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExhibitionHall {
  id: string;
  nameZh: string;
  nameEn: string;
  regionZh: string;
  regionEn: string;
  countryZh: string;
  countryEn: string;
  cityZh: string;
  cityEn: string;
  descriptionZh: string;
  descriptionEn: string;
  bannerUrl: string;
  featuredProductsZh: string[];
  featuredProductsEn: string[];
  capacityValue: string;
}

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

export interface Lead {
  id: string;
  companyName: string;
  country: string;
  city: string;
  contactPerson: string;
  contactMethod: string;
  email: string;
  industry: string;
  mainProducts: string;
  has国际公共采购Participation: boolean;
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
  categoryZh: string;
  categoryEn: string;
  summaryZh: string;
  summaryEn: string;
  contentZh: string;
  contentEn: string;
  isPremium: boolean; // Member-only
  downloadsCount: number;
  fileUrl?: string;
  fileName?: string;
}

export interface FAQItem {
  id: string;
  questionZh: string;
  questionEn: string;
  answerZh: string;
  answerEn: string;
  category: "ungm" | "exhibition" | "general";
}
