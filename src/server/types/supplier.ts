/**
 * 供应商目录类型（服务端副本）
 * Supplier Directory Types — Server-side Copy
 *
 * @module server/types/supplier
 * @description 与 src/types/supplier.ts 保持同步的服务端类型定义。
 */
import "server-only";

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
}
