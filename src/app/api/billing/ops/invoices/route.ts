/**
 * GET /api/billing/ops/invoices — 财务处理列表（白名单账号）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { assertBillingOps } from "@/lib/middleware/billing-ops";
import { listAllInvoiceRequests } from "@/lib/repos/invoice-requests";
import { invoiceRequestsViewOf } from "@/lib/services/billing/view";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  assertBillingOps(auth.userId);
  const status = req.nextUrl.searchParams.get("status");
  const rows = await listAllInvoiceRequests(getContext().dbPool, status);
  return NextResponse.json({ items: invoiceRequestsViewOf(rows) });
});
