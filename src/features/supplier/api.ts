/**
 * 供应商相关 API 调用
 * Supplier API Calls
 *
 * @module features/supplier/api
 * @description 封装供应商目录列表查询与统计的网络请求
 *              Encapsulates supplier directory list and stats fetching requests.
 */

import type { Supplier } from "@/types";
import { api } from "@/core/http";

/**
 * 查询供应商目录（DB 真实数据，按界面语言返回译文，缺失回退中文）
 * Fetch DB-backed supplier directory localized for the given language
 */
export async function fetchSuppliers(lang: string): Promise<Supplier[]> {
  return api<Supplier[]>(`/api/suppliers?lang=${encodeURIComponent(lang)}`);
}

/** 分页查询响应结构 */
export interface SupplierPageResult {
  items: Supplier[];
  total: number;
  page: number;
  pageSize: number;
}

/** 分页查询参数 */
export interface SupplierPageParams {
  page: number;
  pageSize?: number;
  q?: string;
  type?: string;
  industry?: string;
  sort?: string;
}

/**
 * 分页查询供应商目录
 * Paginated supplier directory query
 *
 * 服务端按条件筛选 + 分页，返回 { items, total, page, pageSize }。
 * 数据传输量从全量 ~165KB 降至单页 ~4KB。
 */
export async function fetchSuppliersPaginated(
  lang: string,
  params: SupplierPageParams,
): Promise<SupplierPageResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("lang", lang);
  searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.q) searchParams.set("q", params.q);
  if (params.type) searchParams.set("type", params.type);
  if (params.industry) searchParams.set("industry", params.industry);
  if (params.sort) searchParams.set("sort", params.sort);
  return api<SupplierPageResult>(`/api/suppliers?${searchParams.toString()}`);
}

// ── 供应商共享 API（权威实现在 shared/api/supplier）──
// fetchSupplierById / fetchSupplierContact / SupplierContact / SupplierContactStatus
// 已提升至 @/shared/api/supplier，此处 re-export 保持存量导入兼容。
export { fetchSupplierById, fetchSupplierContact } from "@/shared/api/supplier";
export type { SupplierContact, SupplierContactStatus } from "@/shared/api/supplier";

/** 认证资质参考项 */
export interface CertificationItem {
  id: number;
  name: string;
}

/**
 * 查询认证资质参考列表（crm_supplier_certifications 表）
 */
export async function fetchCertifications(): Promise<CertificationItem[]> {
  return api<CertificationItem[]>("/api/certifications");
}

/** 供应商统计数据 */
export interface SupplierStats {
  searchable: number;
  verified: number;
  withCertification: number;
  international: number;
  registered: number;
  unspscMatched: number;
}

/**
 * 查询供应商统计数据
 */
export async function fetchSupplierStats(): Promise<SupplierStats> {
  return api<SupplierStats>("/api/suppliers/stats");
}
