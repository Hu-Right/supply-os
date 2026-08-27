/**
 * CRM 客户关系管理类型（服务端副本）
 * CRM Types — Server-side Copy
 *
 * @module server/types/crm
 * @description 与 src/types/crm.ts 保持同步的服务端类型定义。
 */
import "server-only";

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
  status: "active" | "closed" | "cancelled";
  createdAt: string;
}
