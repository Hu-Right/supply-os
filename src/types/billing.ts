/**
 * 费用中心（/billing）传输层类型
 *
 * @module types/billing
 * @description 发票申请单视图：服务端 repo 行 → camelCase 对外；状态由财务人工推进。
 */

export type InvoiceRequestStatus = "pending" | "issuing" | "issued" | "void" | "red_flushed";

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
