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
  /** 页签检索字段：product/company/country/industry/certification/factory/unspsc（缺省=公司名） */
  field?: string;
  type?: string;
  /** 行业面标准口径：层级节点码（UGT-I-…），命中该节点子树内的挂靠。
   * 「行业」页签的关键词不在此列——它由服务端解析成节点集后同样按子树筛，
   * 不再接受自由文本等值参数（旧 `industry` 参数已退役）。*/
  industryCode?: string;
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
  if (params.field) searchParams.set("field", params.field);
  if (params.type) searchParams.set("type", params.type);
  if (params.industryCode) searchParams.set("industry_code", params.industryCode);
  if (params.sort) searchParams.set("sort", params.sort);
  return api<SupplierPageResult>(`/api/suppliers?${searchParams.toString()}`);
}

/** 行业筛选面选项（数据源：crm_industry_nodes + 挂靠表，非自由文本去重） */
export interface IndustryFacetOption {
  code: string;
  nameZh: string;
  nameEn: string;
  /** 子树内门户可见供应商数，与列表筛选同口径 */
  suppliers: number;
}

/** 行业筛选面分组：门类作为 optgroup，children 为大类 */
export interface IndustryFacetGroup extends IndustryFacetOption {
  children: IndustryFacetOption[];
}

/**
 * 查询行业筛选面（服务端 10min 缓存）
 * 取代旧做法：拉整页供应商回前端对 industry 文本去重。
 */
export async function fetchIndustryFacets(): Promise<IndustryFacetGroup[]> {
  return api<IndustryFacetGroup[]>("/api/industries/facets");
}

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
