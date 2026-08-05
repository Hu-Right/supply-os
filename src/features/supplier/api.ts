/**
 * 供应商相关 API 调用
 * Supplier API Calls
 *
 * @module features/supplier/api
 * @description 封装供应商自助入驻注册与自定义供应商列表查询的网络请求
 *              Encapsulates supplier self-registration and custom supplier
 *              list fetching requests.
 */

import type { Supplier } from "@/types";
import { api } from "@/core/http";

/**
 * 供应商入驻表单输入
 * Supplier registration form input
 *
 * 中文字段为主，英文字段可留空（提交时以中文兜底，与后端 `nameEn || nameZh` 行为一致）。
 * `mainProducts` / `complianceLabels` 为逗号分隔的原始字符串，提交前切分为数组。
 */
export type SupplierRegisterInput = {
  nameZh: string;
  nameEn: string;
  type: "domestic" | "international";
  industryZh: string;
  countryZh: string;
  cityZh: string;
  ungmCode: string;
  mainProductsZh: string;
  complianceLabelsZh: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
};

/** 逗号分隔字符串切分为去空的数组 */
function splitList(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 提交供应商入驻注册
 * Submit supplier self-registration
 *
 * 字段名严格对齐后端（server.ts 的 `POST /api/suppliers`），编码字段使用 `ungmCode`。
 * 英文字段与后端一致由中文兜底：`nameEn` 交由后端默认，其余英文数组取中文切分结果。
 */
export async function registerSupplier(input: SupplierRegisterInput): Promise<Supplier> {
  const mainProducts = splitList(input.mainProductsZh);
  const compliance = splitList(input.complianceLabelsZh);

  return api<Supplier>("/api/suppliers", {
    method: "POST",
    body: {
      nameZh: input.nameZh.trim(),
      nameEn: input.nameEn.trim() || input.nameZh.trim(),
      type: input.type,
      industryZh: input.industryZh.trim(),
      industryEn: input.industryZh.trim(),
      countryZh: input.countryZh.trim(),
      countryEn: input.countryZh.trim(),
      cityZh: input.cityZh.trim(),
      cityEn: input.cityZh.trim(),
      ungmCode: input.ungmCode.trim() || undefined,
      mainProductsZh: mainProducts,
      mainProductsEn: mainProducts,
      complianceLabelsZh: compliance,
      complianceLabelsEn: compliance,
      contactPerson: input.contactPerson.trim(),
      contactEmail: input.contactEmail.trim(),
      contactPhone: input.contactPhone.trim(),
    },
  });
}

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
  return api<SupplierPageResult>(`/api/suppliers?${searchParams.toString()}`);
}

/**
 * 供应商明文联系方式
 * Plaintext supplier contact info
 */
export type SupplierContact = {
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
};

/**
 * 查询供应商明文联系方式（VIP 专属，403 抛 VIP_REQUIRED）
 * Fetch plaintext supplier contact (VIP only)
 */
export async function fetchSupplierContact(
  id: string,
  userKey: string
): Promise<SupplierContact> {
  return api<SupplierContact>(
    `/api/suppliers/${encodeURIComponent(id)}/contact?user_key=${encodeURIComponent(userKey)}`
  );
}
