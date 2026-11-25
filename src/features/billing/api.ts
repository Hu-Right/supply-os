/**
 * 费用中心客户端 API（发票申请/查询/财务处理）
 *
 * @module features/billing/api
 */
import { api, downloadFile, getAuthToken } from "@/core/http";
import type { CreateInvoiceRequestInput, InvoiceRequestView } from "@/types/billing";

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

// ── 财务处理（白名单账号） ──

export async function fetchOpsInvoiceRequests(status?: string): Promise<InvoiceRequestView[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await api<{ items: InvoiceRequestView[] }>(`/api/billing/ops/invoices${qs}`);
  return Array.isArray(data.items) ? data.items : [];
}

/** 接单 / 作废 / 红冲 */
export function updateInvoiceStatusOps(
  id: number,
  action: "issuing" | "void" | "red_flushed",
  reason?: string,
): Promise<InvoiceRequestView> {
  return api<InvoiceRequestView>(`/api/billing/ops/invoices/${id}/status`, {
    method: "POST",
    body: { action, reason },
  });
}

/** 人工开具：发票号 + 发票文件（multipart） */
export async function issueInvoiceWithFile(
  id: number,
  invoiceNo: string,
  file: File,
): Promise<InvoiceRequestView> {
  const formData = new FormData();
  formData.append("invoiceNo", invoiceNo);
  formData.append("file", file);
  const token = getAuthToken();
  const res = await fetch(`/api/billing/ops/invoices/${id}/issue`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as InvoiceRequestView & { message?: string }) : ({} as InvoiceRequestView);
  if (!res.ok) throw new Error((data as { message?: string }).message || `开具失败（${res.status}）`);
  return data;
}

