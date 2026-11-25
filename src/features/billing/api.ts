/**
 * 费用中心客户端 API（发票申请/查询/财务处理）
 *
 * @module features/billing/api
 */
import { api, downloadFile } from "@/core/http";
import type { CreateInvoiceRequestInput, InvoiceRequestView } from "@/types/billing";

export interface CompanyLookupItem {
  title: string;
  taxNo: string;
}

/** 当前用户的发票申请记录 */
export async function fetchInvoiceRequests(): Promise<InvoiceRequestView[]> {
  const data = await api<{ items: InvoiceRequestView[] }>("/api/billing/invoices");
  return Array.isArray(data.items) ? data.items : [];
}

/** 创建开票申请（服务端重算金额并防重复） */
export function createInvoiceRequest(input: CreateInvoiceRequestInput): Promise<InvoiceRequestView> {
  return api<InvoiceRequestView>("/api/billing/invoices", { method: "POST", body: input });
}

/** 下载发票文件（带 Bearer Token，走 downloadFile 的鉴权下载通道） */
export async function downloadInvoiceFile(url: string, fallbackFileName: string): Promise<void> {
  await downloadFile(url, fallbackFileName);
}

/** 企业抬头检索（选中后自动回填税号） */
export async function searchCompanyTitles(keyword: string): Promise<CompanyLookupItem[]> {
  const data = await api<{ items: CompanyLookupItem[] }>(`/api/billing/company-search?keyword=${encodeURIComponent(keyword)}`);
  return Array.isArray(data.items) ? data.items : [];
}

