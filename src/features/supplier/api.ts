/**
 * 供应商相关 API 调用
 * Supplier API Calls
 *
 * @module features/supplier/api
 * @description 封装供应商目录列表查询与统计的网络请求
 *              Encapsulates supplier directory list and stats fetching requests.
 */

import type { Supplier } from "@/types";
import { api, apiCached } from "@/core/http";
import type { IndustryTreeOption } from "@/lib/services/industry-facets";

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
  /** 行业主轴：行业码（UGT-I-…，门类/大类/中类/小类任一层级），命中该节点子树内的挂靠 */
  industryCode?: string;
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
  if (params.sort) searchParams.set("sort", params.sort);
  return api<SupplierPageResult>(`/api/suppliers?${searchParams.toString()}`);
}

/**
 * 查询行业级联第一级（门类）选项（服务端 10min 缓存）：完整分类树，与第 2~4 级同形状（key=节点码）。
 * 不再按供应商数过滤，零挂靠门类同样可选（选中后正常出「无结果」）。
 */
export async function fetchIndustryFacets(): Promise<IndustryTreeOption[]> {
  return api<IndustryTreeOption[]>("/api/industries/facets");
}

/** 行业级联下拉第 2~4 级选项（key = 节点码，可直接喂 industry_code 子树筛） */
export type { IndustryTreeOption };

/**
 * 取某个父行业码的直接子级（大类→中类→小类）：走 /api/industries/tree，10min 缓存。
 * parent 非法时服务端返回空数组，不给界面假选项。
 */
export const fetchIndustryTreeChildren = (parent: string) =>
  apiCached<IndustryTreeOption[]>(`/api/industries/tree?parent=${encodeURIComponent(parent)}`);

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
