/**
 * POST /api/billing/ops/invoices/[id]/status — 财务推进状态（接单/作废/红冲）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { assertBillingOps } from "@/lib/middleware/billing-ops";
import {
  findInvoiceRequestById,
  markInvoiceIssuing,
  updateInvoiceStatus,
} from "@/lib/repos/invoice-requests";
import { invoiceRequestViewOf } from "@/lib/services/billing/view";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";

interface Ctx {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  action: z.enum(["issuing", "void", "red_flushed"]),
  reason: z.string().trim().max(500).optional(),
  redFlushOf: z.number().int().positive().optional(),
});

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  assertBillingOps(auth.userId);
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) routeError(400, EC_INVALID_PARAMS, "非法申请单 id");
  const body = await parseJson(req, bodySchema);

  const ctx = getContext();
  const current = await findInvoiceRequestById(ctx.dbPool, requestId);
  if (!current) routeError(404, EC_NOT_FOUND, "发票申请单不存在");

  if (body.action === "issuing") {
    if (current.status !== "pending") routeError(400, EC_INVALID_PARAMS, "仅待开票申请可接单");
    await markInvoiceIssuing(ctx.dbPool, requestId, auth.userId);
  } else if (body.action === "void") {
    if (current.status !== "pending" && current.status !== "issuing") {
      routeError(400, EC_INVALID_PARAMS, "仅待开票/开票中申请可作废");
    }
    await updateInvoiceStatus(ctx.dbPool, { id: requestId, status: "void", reason: body.reason ?? null });
  } else {
    if (current.status !== "issued") routeError(400, EC_INVALID_PARAMS, "仅已开具发票可红冲");
    await updateInvoiceStatus(ctx.dbPool, {
      id: requestId,
      status: "red_flushed",
      reason: body.reason ?? null,
      redFlushOf: body.redFlushOf ?? requestId,
    });
  }

  const updated = await findInvoiceRequestById(ctx.dbPool, requestId);
  if (!updated) routeError(404, EC_NOT_FOUND, "发票申请单不存在");
  return NextResponse.json(invoiceRequestViewOf(updated));
});
