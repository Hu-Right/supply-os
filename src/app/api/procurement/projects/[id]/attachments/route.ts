/**
 * /api/procurement/projects/[id]/attachments — 需求附件（七步流程第 2 步）
 *
 * @module app/api/procurement/projects/[id]/attachments/route
 * @description GET = 附件清单（owner）；POST = multipart 上传（字节入库+哈希，草稿期
 *              version_no=0，提交时随版本冻结）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INTERNAL_ERROR, EC_INVALID_PARAMS } from "@/shared/constants/api";
import { isProjectOwnedBy } from "@/lib/services/procurement/projects";
import { addAttachment, listAttachments } from "@/lib/services/procurement/attachments";
import { PROCUREMENT_FILE_URL_PREFIX } from "@/lib/services/file-upload";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  }
  const pool = getPool();
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) {
    routeError(403, EC_FORBIDDEN, "无权查看此项目附件");
  }
  const rows = await listAttachments(pool, projectId);
  /** 附件清单视图 */
  const attachmentListViewOf = (list: typeof rows) => ({
    items: list.map((a) => ({
      id: Number(a.id),
      versionNo: Number(a.version_no),
      kind: String(a.kind),
      filename: String(a.filename),
      fileUrl: `${PROCUREMENT_FILE_URL_PREFIX}/${String(a.file_key)}`,
      fileHash: String(a.file_hash),
      sizeBytes: Number(a.size_bytes),
      uploadedAt: Number(a.uploaded_at),
    })),
    total: list.length,
  });
  return NextResponse.json(attachmentListViewOf(rows));
});

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 格式上传");
  }
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const kind = String(formData.get("kind") || "requirement");
  if (!file) routeError(400, EC_INVALID_PARAMS, "请选择要上传的文件");

  const pool = getPool();
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) {
    routeError(403, EC_FORBIDDEN, "无权操作此项目");
  }

  try {
    const result = await addAttachment(pool, {
      projectId,
      uploadedBy: auth.userId,
      filename: file.name,
      contentType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
      kind,
    });
    if (!result.ok) {
      if (result.reason === "bad_type") routeError(400, EC_INVALID_PARAMS, "不支持的文件格式（pdf/图片/office/zip）");
      routeError(400, EC_INVALID_PARAMS, "文件大小不能超过 20MB");
    }
    /** 上传结果视图 */
    const attachmentAddedViewOf = (aid: number, fileUrl: string) => ({ id: aid, fileUrl });
    return NextResponse.json(attachmentAddedViewOf(result.id, result.fileUrl));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/projects/[id]/attachments] upload failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "附件上传失败，请稍后重试");
  }
});
