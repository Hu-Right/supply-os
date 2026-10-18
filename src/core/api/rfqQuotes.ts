/**
 * RFQ 报价 API client
 * @module core/api/rfqQuotes
 * @description 供应商侧提交/更新报价（POST /api/rfq/[id]/quotes），采购方侧汇总比价（GET）与选定中标（POST award）。
 *              资格与截止由后端闸口把关，失败以 ApiError.message 回传前端展示。
 */
import { api } from "@/core/http";

export interface QuotePayload {
  price: number;
  currency?: string;
  lead_time_days?: number | null;
  delivery_terms?: string | null;
  note?: string | null;
}

/** 采购方比价行（后端 listQuotesForBuyer 映射后的形状）。 */
export interface QuoteRow {
  id: number;
  supplierUserId: number;
  company: string;
  price: number;
  currency: string;
  leadTimeDays: number | null;
  deliveryTerms: string;
  note: string;
  status: string;
  createdAt: string;
}

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

/** 提交/更新当前供应商对该 RFQ 的报价，返回 quoteId。 */
export async function submitRfqQuote(rfqId: number, payload: QuotePayload): Promise<{ quoteId: number }> {
  const res = await api<Envelope<{ quoteId: number }>>(`/api/rfq/${rfqId}/quotes`, {
    method: "POST",
    body: payload,
  });
  return res.data;
}

/** 采购方查看该 RFQ 报价汇总（仅创建者；按价升序）。 */
export async function fetchBuyerQuotes(rfqId: number): Promise<QuoteRow[]> {
  const res = await api<Envelope<{ items: QuoteRow[]; total: number }>>(`/api/rfq/${rfqId}/quotes`);
  return res.data.items;
}

/** 采购方选定中标（仅创建者）。 */
export async function awardRfqQuote(rfqId: number, quoteId: number): Promise<{ winnerSupplierUserId: number; rejectedCount: number }> {
  const res = await api<Envelope<{ winnerSupplierUserId: number; rejectedCount: number }>>(`/api/rfq/${rfqId}/award`, {
    method: "POST",
    body: { quoteId },
  });
  return res.data;
}

/** 供应商撤回自己的一份 submitted 报价（已选定/已撤回则失败）。 */
export async function withdrawRfqQuote(rfqId: number, quoteId: number): Promise<void> {
  await api<Envelope<{ withdrawn: boolean }>>(`/api/rfq/${rfqId}/quotes`, { method: "DELETE", body: { quoteId } });
}

/** 采购方撤销本需求的中选选定（won/rejected 回退 submitted，重新开放报价）。 */
export async function unawardRfqQuote(rfqId: number): Promise<void> {
  await api<Envelope<{ revoked: boolean }>>(`/api/rfq/${rfqId}/unaward`, { method: "POST", body: {} });
}

/** 供应商“我的报价”行（对应 /api/rfq/my-quotes）。 */
export interface MyQuoteRow {
  quoteId: number;
  rfqId: number;
  title: string;
  reference: string;
  rfqStatus: string;
  price: number;
  currency: string;
  leadTimeDays: number | null;
  quoteStatus: string;
  deadlineSec: number;
  updatedAt: string;
}

/** 拉取当前供应商的全部有效报价（裸 {items,total} 响应）。 */
export async function fetchMyQuotes(): Promise<MyQuoteRow[]> {
  const res = await api<{ items: MyQuoteRow[]; total: number }>("/api/rfq/my-quotes");
  return Array.isArray(res.items) ? res.items : [];
}
