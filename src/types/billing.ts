/**
 * 费用中心（/billing）传输层类型
 *
 * @module types/billing
 * @description 发票申请单视图：服务端 repo 行 → camelCase 对外。
 *              一期人工开具（manifest），二期第三方 API（issueChannel=api）共用同一状态机。
 */

export type InvoiceRequestStatus = "pending" | "issuing" | "issued" | "void" | "red_flushed";

export type InvoiceIssueChannel = "manual" | "api";

export interface InvoiceRequestView {
  id: number;
  userId: number;
  orderNos: string[];
  amount: number;
  invoiceType: "normal" | "special";
  title: string;
  taxNo: string | null;
  email: string;
  addressPhone: string | null;
  status: InvoiceRequestStatus;
  issueChannel: InvoiceIssueChannel;
  provider: string | null;
  providerRequestId: string | null;
  invoiceNo: string | null;
  /** 鉴权下载地址（如 /api/billing/invoices/invoice_1_xxx.pdf） */
  invoiceFileUrl: string | null;
  fileType: string | null;
  issuedAt: string | null;
  operatorId: number | null;
  redFlushOf: number | null;
  rejectReason: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceRequestInput {
  orderNos: string[];
  amount: number;
  invoiceType: "normal" | "special";
  title: string;
  taxNo?: string | null;
  email: string;
  addressPhone?: string | null;
}
