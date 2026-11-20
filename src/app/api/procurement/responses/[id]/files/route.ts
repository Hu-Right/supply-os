/**
 * /api/procurement/responses/[id]/files — 响应附件（上传 / 删除）
 *
 * @module app/api/procurement/responses/[id]/files/route
 * @description POST = multipart 上传（仅草稿期；字节入库，回文件走 /api/procurement/response-files）；
 *              DELETE = 删除附件（?fileId=）。
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
import { addResponseFile, deleteResponseFile } from "@/lib/services/procurement/responses";

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) routeError(400, EC_INVALID_PARAMS, "无效的响应 ID");
  return id;
}

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const responseId = parseId(id);

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 上传");
  }
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) routeError(400, EC_INVALID_PARAMS, "请选择要上传的文件");

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await addResponseFile(getPool(), {
    responseId,
    userId: auth.userId,
    fileName: file.name || "file",
    contentType: file.type || "application/octet-stream",
    buffer,
    envelope: String(form.get("envelope") || "technical"),
    docKind: String(form.get("docKind") || "attachment"),
  });

  if (!result.ok) {
    switch (result.reason) {
      case "forbidden":
        routeError(403, EC_FORBIDDEN, "无权上传该响应的附件");
        break;
      case "not_found":
        routeError(404, EC_RFQ_RESPONSE_NOT_FOUND, "响应不存在");
        break;
      case "closed":
        routeError(409, EC_RFQ_RESPONSE_CLOSED, "已过报价截止，无法上传附件");
        break;
      case "bad_type":
        routeError(400, EC_INVALID_PARAMS, "不支持的文件类型");
        break;
      case "too_large":
        routeError(400, EC_INVALID_PARAMS, "文件超过 20MB");
        break;
      default:
        routeError(409, EC_RFQ_STATE_INVALID, "当前状态不允许上传附件");
    }
  }

  return NextResponse.json(
    {
      ok: true,
      file: {
        id: Number(result.file.id),
        envelope: String(result.file.envelope),
        docKind: String(result.file.doc_kind),
        fileName: String(result.file.file_name),
        fileHash: String(result.file.file_hash),
        fileSize: Number(result.file.file_size),
        fileUrl: `/api/procurement/response-files/${encodeURIComponent(String(result.file.file_key))}`,
      },
    },
    { status: 201 },
  );
});

export const DELETE = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const responseId = parseId(id);
  const fileId = Number(req.nextUrl.searchParams.get("fileId") || 0);
  if (!Number.isFinite(fileId) || fileId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的附件 ID");

  const result = await deleteResponseFile(getPool(), { responseId, fileId, userId: auth.userId });
  if (!result.ok) {
    if (result.reason === "forbidden") routeError(403, EC_FORBIDDEN, "无权删除该附件");
    if (result.reason === "not_found") routeError(404, EC_RFQ_RESPONSE_NOT_FOUND, "附件不存在");
    routeError(409, EC_RFQ_STATE_INVALID, "当前状态不允许删除附件");
  }
  return NextResponse.json({ ok: true });
});