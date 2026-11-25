/**
 * /api/billing/invoices — 费用中心「发票管理」
 *
 * @module app/api/billing/invoices/route
 * @description
 *   GET  当前登录用户的发票申请记录（按申请时间倒序，最多 50 条）；
 *   POST 创建开票申请：按用户勾选的已支付订单合并开票，一期由财务人工开具。
 *        发票不在支付环节采集（支付页仅提示到费用中心申请）。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { listInvoiceRequests } from "@/lib/repos/invoice-requests";
import { createInvoiceForUser } from "@/lib/services/billing/invoices";
import { invoiceRequestViewOf, invoiceRequestsViewOf } from "@/lib/services/billing/view";

const createInvoiceSchema = z.object({
  orderNos: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  amount: z.number().positive().max(1_000_000),
  invoiceType: z.enum(["normal", "special"]),
  title: z.string().trim().min(1).max(200),
  taxNo: z.string().trim().max(40).nullish(),
  email: z.string().trim().email().max(160),
  addressPhone: z.string().trim().max(300).nullish(),
});

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const rows = await listInvoiceRequests(getContext().dbPool, auth.userId);
  return NextResponse.json({ items: invoiceRequestsViewOf(rows) });
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const body = await parseJson(req, createInvoiceSchema);
  const item = await createInvoiceForUser(getContext().dbPool, auth.userId, {
    orderNos: body.orderNos,
    amount: body.amount,
    invoiceType: body.invoiceType,
    title: body.title,
    taxNo: body.taxNo ?? null,
    email: body.email,
    addressPhone: body.addressPhone ?? null,
  });
  return NextResponse.json(invoiceRequestViewOf(item), { status: 201 });
});



