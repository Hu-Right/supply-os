/**
 * GET /api/billing/invoices/[filename] — 发票文件鉴权下载
 *
 * 文件名 invoice_<requestId>_<ts>.<pdf|ofd|xml>；申请单归属人或财务白名单可下载。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { isBillingOpsUser } from "@/lib/middleware/billing-ops";
import { getInvoiceRequestForViewer } from "@/lib/services/billing/invoices";
import { getInvoiceFile, INVOICE_FILENAME_RE, parseInvoiceRequestId } from "@/lib/services/file-upload";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";

interface Ctx {
  params: Promise<{ filename: string }>;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { filename } = await params;
  if (!INVOICE_FILENAME_RE.test(filename)) routeError(400, EC_INVALID_PARAMS, "非法的文件名");

  const requestId = parseInvoiceRequestId(filename);
  const row = await getInvoiceRequestForViewer(getContext().dbPool, requestId, {
    userId: auth.userId,
    isOps: isBillingOpsUser(auth.userId),
  });
  if (!row.invoiceFileUrl || !row.invoiceFileUrl.endsWith(filename)) {
    routeError(404, EC_NOT_FOUND, "发票文件不存在");
  }

  const file = await getInvoiceFile(filename);
  if (!file) routeError(404, EC_NOT_FOUND, "发票文件不存在");

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
