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
  /** 产品 / 公司关键词（落在哪一列由 field 决定） */
  q?: string;
  /** 关键词检索字段：product | company（缺省与白名单外值均回落公司名） */
  field?: string;
  /** 行业主轴：门类码（UGT-I-…），命中该节点子树内的挂靠 */
  industryCode?: string;
  /**
   * 行业关键词：服务端先把它解析成行业节点集再按子树筛，因此它能与
   * industryCode / q 同时生效（AND 交集）。旧 `industry`（自由文本等值）与
   * `type`（国内/国际）参数已于 2026-10-10 退役。
   */
  industryQ?: string;
  /** 排序键：newest | completeness（白名单在 repo，无实现值的选项已删除） */
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
  if (params.industryCode) searchParams.set("industry_code", params.industryCode);
  if (params.industryQ) searchParams.set("industry_q", params.industryQ);
  if (params.sort) searchParams.set("sort", params.sort);
  return api<SupplierPageResult>(`/api/suppliers?${searchParams.toString()}`);
}

/** 行业主轴选项（数据源：crm_industry_nodes + 挂靠表，非自由文本去重） */
export interface IndustryFacetOption {
  code: string;
  nameZh: string;
  nameEn: string;
  /** 子树内门户可见供应商数，与列表筛选同口径 */
  suppliers: number;
}

/**
 * 查询行业主轴（门类一层，服务端 10min 缓存）
 * 取代旧做法：拉整页供应商回前端对 industry 文本去重。
 * 只铺门类不铺大类：大类以下由行业关键词框接，而英文侧 37 个大类与门类同名。
 */
export async function fetchIndustryFacets(): Promise<IndustryFacetOption[]> {
  return api<IndustryFacetOption[]>("/api/industries/facets");
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
