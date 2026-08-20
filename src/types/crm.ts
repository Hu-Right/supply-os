/**
 * CRM 客户关系管理类型
 * CRM (Customer Relationship Management) Types
 *
 * @module types/crm
 * @description 线索（Lead）与商机（Opportunity）实体，覆盖销售漏斗、跟进日志及订阅状态
 *              Lead and Opportunity entities covering sales pipeline, follow-up logs, and subscription tracking
 */

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
  hasIntlProcurement: boolean;
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
