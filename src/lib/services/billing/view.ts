/**
 * 发票申请单视图（wire 契约）
 *
 * @module lib/services/billing/view
 * @description repo 行 → API 响应视图：显式列键、camelCase、字段白名单；
 *              禁止把 repo 行整块透出（check-api-field-naming 红线）。
 */
import type { InvoiceRequestView } from "@/types/billing";

/** 单行视图：只出 wire 需要的键，状态收敛到合法枚举 */
export function invoiceRequestViewOf(row: InvoiceRequestView): InvoiceRequestView {
  return {
    id: row.id,
    userId: row.userId,
    orderNos: Array.isArray(row.orderNos) ? row.orderNos : [],
    amount: Number(row.amount),
    invoiceType: row.invoiceType === "special" ? "special" : "normal",
    title: row.title,
    taxNo: row.taxNo,
    email: row.email,
    addressPhone: row.addressPhone,
    buyerType: row.buyerType === "personal" ? "personal" : "enterprise",
    phone: row.phone,
    bankName: row.bankName,
    bankAccount: row.bankAccount,
    status: row.status,
    issueChannel: row.issueChannel === "api" ? "api" : "manual",
    provider: row.provider,
    providerRequestId: row.providerRequestId,
    invoiceNo: row.invoiceNo,
    invoiceFileUrl: row.invoiceFileUrl,
    fileType: row.fileType,
    issuedAt: row.issuedAt,
    operatorId: row.operatorId,
    redFlushOf: row.redFlushOf,
    rejectReason: row.rejectReason,
    remark: row.remark,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 列表视图：逐行过单行视图（wire 只出白名单键） */
export function invoiceRequestsViewOf(rows: InvoiceRequestView[]): InvoiceRequestView[] {
  return rows.map(invoiceRequestViewOf);
}
