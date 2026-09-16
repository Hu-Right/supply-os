/**
 * 供应商公共 API（跨 feature 共享）
 * Supplier Shared API
 *
 * @module shared/api/supplier
 * @description 被 supplier 与 supplier-profile 共同消费的 API 调用与类型定义。
 *              从 features/supplier/api.ts 提升至 shared 层以消除跨 feature 硬依赖。
 */

import type { Supplier } from "@/types";
import { api } from "@/core/http";

/**
 * 供应商明文联系方式
 * Plaintext supplier contact info
 */
export type SupplierContact = {
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
};

/** 供应商联系方式弹窗状态 */
export type SupplierContactStatus = "vipOnly" | "loading" | "success" | "error";

/**
 * 查询单条供应商详情
 * Fetch single supplier by ID
 */
export async function fetchSupplierById(lang: string, id: string): Promise<Supplier> {
  return api<Supplier>(`/api/suppliers/${encodeURIComponent(id)}?lang=${encodeURIComponent(lang)}`);
}

/**
 * 查询供应商明文联系方式（VIP 专属，403 抛 VIP_REQUIRED）
 * Fetch plaintext supplier contact (VIP only)
 */
export async function fetchSupplierContact(id: string): Promise<SupplierContact> {
  return api<SupplierContact>(`/api/suppliers/${encodeURIComponent(id)}/contact`);
}
