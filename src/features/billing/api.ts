/**
 * 费用中心客户端 API（发票申请/查询）
 *
 * @module features/billing/api
 */
import { api } from "@/core/http";
import type { CreateInvoiceRequestInput, InvoiceRequestView } from "@/types/billing";

/** 当前用户的发票申请记录 */
export async function fetchInvoiceRequests(): Promise<InvoiceRequestView[]> {
  const data = await api<{ items: InvoiceRequestView[] }>("/api/billing/invoices");
  return Array.isArray(data.items) ? data.items : [];
}

/** 创建开票申请（按已支付订单合并开票，财务人工开具） */
export function createInvoiceRequest(input: CreateInvoiceRequestInput): Promise<InvoiceRequestView> {
  return api<InvoiceRequestView>("/api/billing/invoices", { method: "POST", body: input });
}
