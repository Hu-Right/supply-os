/**
 * /api/procurement/projects/[id]/documents — ITB 招标文件包（GET / POST / DELETE）
 *
 * @module app/api/procurement/projects/[id]/documents/route
 * @description GET = 文件包清单（归属人全量；?public=1 走公开过滤）；POST = 上传
 *              （multipart：file + docKind + visibility；草稿期任意件套，发布后仅 qa_addendum
 *              且答疑截止前——44017）；DELETE?id= = 删草稿件（已冻结不可删）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_QA_CLOSED,
  EC_RFQ_STATE_INVALID,
  EC_RFQ_TENDER_CONFIG_INVALID,
} from "@/shared/constants/api";
import {
  addTenderDocument,
  deleteDraftTenderDocument,
  listTenderDocuments,
} from "@/lib/services/procurement/tender-documents";
import { isProjectOwnedBy } from "@/lib/services/procurement/projects";

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseProjectId(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  return n;
}

/** 文件包清单视图（哈希/上传人/版本留痕字段对齐 F14） */
function docRowsViewOf(rows: Awaited<ReturnType<typeof listTenderDocuments>>) {
  return {
    documents: rows.map((r) => ({
      id: Number(r.id),
      docKind: String(r.doc_kind),
      fileName: String(r.file_name),
      fileKey: String(r.file_key),
      fileHash: String(r.file_hash),
      fileSize: Number(r.file_size),
      visibility: String(r.visibility),
      published: Number(r.published) === 1,
      versionNo: Number(r.version_no),
      uploadedBy: r.uploaded_by == null ? null : Number(r.uploaded_by),
      createdAt: Number(r.created_at),
    })),
  };
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);
  const pool = getPool();
  const publicOnly = new URL(req.url).searchParams.get("public") === "1";

  if (publicOnly) {
    // 公开面：已发布 + public 可见性的文件（公告附件）
    return NextResponse.json(docRowsViewOf(await listTenderDocuments(pool, projectId, { publicOnly: true })));
  }
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) routeError(403, EC_FORBIDDEN, "无权查看该项目");
  return NextResponse.json(docRowsViewOf(await listTenderDocuments(pool, projectId)));
});

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求须为 multipart/form-data");
  }
  const file = form.get("file");
  const docKind = String(form.get("docKind") ?? "");
  const visibility = String(form.get("visibility") ?? "public");
  if (!(file instanceof File) || file.size === 0) routeError(400, EC_INVALID_PARAMS, "缺少文件");
  if (!docKind) routeError(400, EC_INVALID_PARAMS, "缺少 docKind");

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await addTenderDocument(getPool(), {
    projectId,
    buyerUserId: auth.userId,
    docKind,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    buffer,
    visibility,
  });
  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
        break;
      case "not_editable":
        routeError(409, EC_RFQ_STATE_INVALID, "仅草稿或待补充状态可维护文件包");
        break;
      case "frozen":
        routeError(409, EC_RFQ_STATE_INVALID, "文件包已随发布冻结：核心件不可改，变更请重传新记录");
        break;
      case "qa_closed":
        routeError(409, EC_RFQ_QA_CLOSED, "答疑期已截止，不再接受新增答疑或补遗");
        break;
      case "kind_invalid":
        routeError(400, EC_RFQ_TENDER_CONFIG_INVALID, "docKind 不在文件类型白名单内");
        break;
      case "bad_type":
        routeError(400, EC_INVALID_PARAMS, "不支持的文件类型");
        break;
      case "too_large":
        routeError(400, EC_INVALID_PARAMS, "文件超过 20MB 上限");
        break;
      default:
        routeError(403, EC_FORBIDDEN, "无权操作该项目");
    }
  }

  /** 上传结果视图 */
  const uploadedViewOf = (r: Extract<typeof result, { ok: true }>) => ({ id: r.id, fileUrl: r.fileUrl });
  return NextResponse.json(uploadedViewOf(result));
});

export const DELETE = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);
  const docId = Number(new URL(req.url).searchParams.get("id") ?? 0);
  if (!Number.isFinite(docId) || docId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的文件 ID");

  const result = await deleteDraftTenderDocument(getPool(), projectId, auth.userId, docId);
  if (!result.ok) {
    if (result.reason === "not_found") routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
    routeError(409, EC_RFQ_STATE_INVALID, "文件包已冻结，不可删除");
  }
  return NextResponse.json({ deleted: result.ok ? result.deleted : false });
});
