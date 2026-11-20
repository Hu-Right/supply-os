/**
 * /api/procurement/responses/[id] — 供应商本人响应（查看 / 改草稿）
 *
 * @module app/api/procurement/responses/[id]/route
 * @description GET = 本人响应（含明细、附件、回执）；PATCH = 改草稿（只允许 draft，
 *              明细整组替换）。提交走 /submit，撤回走 /withdraw。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_RESPONSE_CLOSED,
  EC_RFQ_RESPONSE_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
} from "@/shared/constants/api";
import { getResponseDetail, updateDraft, type ResponseItemInput } from "@/lib/services/procurement/responses";

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) routeError(400, EC_INVALID_PARAMS, "无效的响应 ID");
  return id;
}

function toItemInput(raw: unknown): ResponseItemInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const dec = (v: unknown): string | number | null => (typeof v === "string" || typeof v === "number" ? v : null);
  const str = (v: unknown, max: number): string | null => (v == null ? null : String(v).slice(0, max));
  return {
    itemId: num(r.itemId ?? r.item_id),
    lotId: num(r.lotId ?? r.lot_id),
    unitPrice: dec(r.unitPrice ?? r.unit_price),
    quantity: dec(r.quantity),
    uom: str(r.uom, 20),
    leadTimeDays: num(r.leadTimeDays ?? r.lead_time_days),
    moq: dec(r.moq),
    brandModel: str(r.brandModel, 200),
    compliance: r.compliance ?? null,
    remark: str(r.remark, 500),
  };
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const result = await getResponseDetail(getPool(), { responseId: parseId(id), userId: auth.userId });
  if (!result.ok) {
    if (result.reason === "forbidden") routeError(403, EC_FORBIDDEN, "无权查看该响应");
    routeError(404, EC_RFQ_RESPONSE_NOT_FOUND, "响应不存在");
  }
  return NextResponse.json({
    response: {
      id: Number(result.response.id),
      projectId: Number(result.response.project_id),
      versionNo: Number(result.response.version_no),
      status: String(result.response.status),
      currency: String(result.response.currency),
      incoterm: result.response.incoterm,
      incotermPlace: result.response.incoterm_place,
      validityDays: result.response.validity_days,
      leadTimeDays: result.response.lead_time_days,
      taxIncluded: Number(result.response.tax_included) === 1,
      remark: result.response.remark,
      receiptNo: result.response.receipt_no,
      receiptHash: result.response.receipt_hash,
      sealedUntil: Number(result.response.sealed_until),
      submittedAt: result.response.submitted_at,
    },
    items: result.items,
    files: result.files.map((f) => ({
      id: Number(f.id),
      envelope: String(f.envelope),
      docKind: String(f.doc_kind),
      fileName: String(f.file_name),
      fileHash: String(f.file_hash),
      fileSize: Number(f.file_size),
      fileUrl: `/api/procurement/response-files/${encodeURIComponent(String(f.file_key))}`,
      createdAt: Number(f.created_at),
    })),
    total: result.total,
  });
});

export const PATCH = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const responseId = parseId(id);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }

  const rawItems = body.items;
  if (rawItems !== undefined && !Array.isArray(rawItems)) {
    routeError(400, EC_INVALID_PARAMS, "items 必须是数组");
  }
  const items = Array.isArray(rawItems)
    ? rawItems.map(toItemInput).filter((v): v is ResponseItemInput => v !== null)
    : undefined;

  const result = await updateDraft(getPool(), {
      responseId,
      userId: auth.userId,
      patch: {
        currency: body.currency == null ? undefined : String(body.currency).slice(0, 10),
        incoterm: body.incoterm == null ? null : String(body.incoterm).slice(0, 20),
        incotermPlace:
          body.incotermPlace == null && body.incoterm_place == null
            ? null
            : String(body.incotermPlace ?? body.incoterm_place).slice(0, 120),
        validityDays: body.validityDays == null ? null : Number(body.validityDays),
        leadTimeDays: body.leadTimeDays == null ? null : Number(body.leadTimeDays),
        taxIncluded: body.taxIncluded == null ? undefined : Boolean(body.taxIncluded),
        remark: body.remark == null ? null : String(body.remark).slice(0, 1000),
        items,
      },
    });
    if (!result.ok) {
      switch (result.reason) {
        case "forbidden":
          routeError(403, EC_FORBIDDEN, "无权修改该响应");
          break;
        case "not_found":
          routeError(404, EC_RFQ_RESPONSE_NOT_FOUND, "响应不存在");
          break;
        case "closed":
          routeError(409, EC_RFQ_RESPONSE_CLOSED, "已过报价截止，无法修改");
          break;
        default:
          routeError(409, EC_RFQ_STATE_INVALID, "当前状态不允许修改");
      }
    }
    return NextResponse.json({ ok: true, total: result.total, status: result.response.status });
});