/**
 * POST /api/billing/ops/invoices/[id]/issue — 财务开具发票（人工渠道）
 *
 * multipart/form-data：invoiceNo + file（pdf/ofd/xml）
 * 开具后用户侧可见「已开具」并下载。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { assertBillingOps } from "@/lib/middleware/billing-ops";
import { findInvoiceRequestById, issueInvoiceRequest } from "@/lib/repos/invoice-requests";
import { invoiceRequestViewOf } from "@/lib/services/billing/view";
import { saveInvoiceFile } from "@/lib/services/file-upload";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";

interface Ctx {
  params: Promise<{ id: string }>;
}

const ALLOWED_EXT = ["pdf", "ofd", "xml"] as const;
const MAX_SIZE = 10 * 1024 * 1024;

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  assertBillingOps(auth.userId);
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) routeError(400, EC_INVALID_PARAMS, "非法申请单 id");

  const ctx = getContext();
  const current = await findInvoiceRequestById(ctx.dbPool, requestId);
  if (!current) routeError(404, EC_NOT_FOUND, "发票申请单不存在");
  if (current.status !== "pending" && current.status !== "issuing") {
    routeError(400, EC_INVALID_PARAMS, "当前状态不可开具（仅待开票/开票中可开具）");
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 上传发票文件");
  }
  const formData = await req.formData();
  const invoiceNo = String(formData.get("invoiceNo") || "").trim();
  if (!invoiceNo || invoiceNo.length > 64) routeError(400, EC_INVALID_PARAMS, "请填写发票号码");
  const file = formData.get("file") as File | null;
  if (!file) routeError(400, EC_INVALID_PARAMS, "请选择发票文件");
  if (file.size > MAX_SIZE) routeError(400, EC_INVALID_PARAMS, "发票文件不能超过 10MB");

  const ext = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
    routeError(400, EC_INVALID_PARAMS, "仅支持 pdf / ofd / xml 格式发票文件");
  }

  const filename = `invoice_${requestId}_${Date.now().toString(36)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveInvoiceFile({
    filename,
    buffer,
    contentType: file.type || (ext === "pdf" ? "application/pdf" : ext === "xml" ? "application/xml" : "application/ofd"),
    uploadedBy: auth.userId,
  });

  await issueInvoiceRequest(ctx.dbPool, {
    id: requestId,
    invoiceNo,
    fileUrl: saved.url,
    fileType: ext,
    operatorId: auth.userId,
  });

  const updated = await findInvoiceRequestById(ctx.dbPool, requestId);
  if (!updated) routeError(404, EC_NOT_FOUND, "发票申请单不存在");
  return NextResponse.json(invoiceRequestViewOf(updated));
});
