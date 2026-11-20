/**
 * /api/procurement/projects/[id]/responses — 响应入口（双角色共用一个路径）
 *
 * @module app/api/procurement/projects/[id]/responses/route
 * @description POST = 供应商创建/取回本人草稿（需已绑定企业）；
 *              GET  = 采购方查看响应：密封期只回份数，开标后回摘要。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INTERNAL_ERROR,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_RESPONSE_CLOSED,
  EC_RFQ_STATE_INVALID,
  EC_SUPPLIER_PROFILE_REQUIRED,
} from "@/shared/constants/api";
import {
  createOrGetDraft,
  listResponsesForBuyer,
  type ResponseDetail,
} from "@/lib/services/procurement/responses";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** 响应详情视图（供应商与采购方共用字段口径） */
function responseView(d: ResponseDetail) {
  return {
    response: {
      id: Number(d.response.id),
      projectId: Number(d.response.project_id),
      versionNo: Number(d.response.version_no),
      tenderId: Number(d.response.tender_id),
      supplierId: Number(d.response.supplier_id),
      status: String(d.response.status),
      method: String(d.response.method),
      currency: String(d.response.currency),
      incoterm: d.response.incoterm,
      incotermPlace: d.response.incoterm_place,
      validityDays: d.response.validity_days,
      leadTimeDays: d.response.lead_time_days,
      taxIncluded: Number(d.response.tax_included) === 1,
      remark: d.response.remark,
      receiptNo: d.response.receipt_no,
      receiptHash: d.response.receipt_hash,
      sealedUntil: Number(d.response.sealed_until),
      submittedAt: d.response.submitted_at,
      withdrawnAt: d.response.withdrawn_at,
    },
    items: d.items.map((it) => ({
      id: Number(it.id),
      itemId: it.item_id,
      lotId: it.lot_id,
      seq: Number(it.seq),
      unitPrice: it.unit_price,
      quantity: it.quantity,
      uom: it.uom,
      leadTimeDays: it.lead_time_days,
      moq: it.moq,
      brandModel: it.brand_model,
      compliance: it.compliance,
      remark: it.remark,
    })),
    files: d.files.map((f) => ({
      id: Number(f.id),
      envelope: String(f.envelope),
      docKind: String(f.doc_kind),
      fileName: String(f.file_name),
      fileHash: String(f.file_hash),
      fileSize: Number(f.file_size),
      fileUrl: `/api/procurement/response-files/${encodeURIComponent(String(f.file_key))}`,
      createdAt: Number(f.created_at),
    })),
    total: d.total,
  };
}

function parseProjectId(raw: string): number {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  return id;
}

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);

  const result = await createOrGetDraft(getPool(), { projectId, userId: auth.userId });
  if (!result.ok) {
    switch (result.reason) {
      case "forbidden":
        routeError(403, EC_SUPPLIER_PROFILE_REQUIRED, "需先认领并绑定企业后才能报价");
        break;
      case "not_found":
        routeError(404, EC_RFQ_NOT_FOUND, "采购需求不存在");
        break;
      case "closed":
        routeError(409, EC_RFQ_RESPONSE_CLOSED, "已过报价截止，无法继续报价");
        break;
      default:
        routeError(409, EC_RFQ_STATE_INVALID, "当前需求状态不允许报价");
    }
  }

  const view = responseView(result);
  return NextResponse.json(
    { response: view.response, items: view.items, files: view.files, total: view.total },
    { status: 201 },
  );
});

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);

  try {
    const result = await listResponsesForBuyer(getPool(), { projectId, buyerUserId: auth.userId });
    if (!result.ok) {
      if (result.reason === "forbidden") routeError(403, EC_FORBIDDEN, "无权查看该项目的响应");
      routeError(404, EC_RFQ_NOT_FOUND, "采购需求不存在");
    }
    return NextResponse.json({
      opened: result.opened,
      count: result.count,
      items: result.items,
    });
  } catch (err) {
    if (err instanceof RouteError) throw err;
    routeError(500, EC_INTERNAL_ERROR, "响应列表读取失败，请稍后重试");
  }
});