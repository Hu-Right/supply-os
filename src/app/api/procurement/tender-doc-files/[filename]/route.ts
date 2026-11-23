/**
 * GET /api/procurement/tender-doc-files/[filename] — 招标文件包回文件
 *
 * @module app/api/procurement/tender-doc-files/[filename]/route
 * @description 文件名 attach_<projectId>_<uid>_<ts>.<ext>（复用 attach_ 存储通道）。
 *              可见性三档（F14 最小权限）：
 *              ① 归属人：全量可见；
 *              ② 已提交响应的供应商：该项目的 published 文件（respondents/public 均可）；
 *              ③ 其他登录用户：仅 published 且 visibility=public（公告附件）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { PROCUREMENT_FILE_FILENAME_RE, getProcurementFile } from "@/lib/services/file-upload";
import { resolveSupplierIdForUser } from "@/lib/services/procurement/responses";
import type { RowDataPacket } from "mysql2/promise";

interface Ctx {
  params: Promise<{ filename: string }>;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { filename } = await params;
  if (!PROCUREMENT_FILE_FILENAME_RE.test(filename)) {
    routeError(400, EC_INVALID_PARAMS, "非法的文件名");
  }
  const projectId = Number(filename.split("_")[1]);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "非法的文件名");
  }
  const pool = getPool();

  // ① 归属人全量
  const [ownerRows] = await pool.query(
    `SELECT p.id FROM procurement_projects p
      JOIN procurement_buyers b ON b.id = p.buyer_id
      WHERE p.id = ? AND b.user_id = ? LIMIT 1`,
    [projectId, auth.userId],
  );
  const isOwner = (ownerRows as RowDataPacket[]).length > 0;

  // ② 已提交响应的供应商：published 全量
  let isRespondent = false;
  if (!isOwner) {
    const supplierId = await resolveSupplierIdForUser(pool, auth.userId);
    if (supplierId) {
      const [respRows] = await pool.query(
        `SELECT id FROM procurement_responses
          WHERE project_id = ? AND supplier_id = ? AND status IN ('submitted','evaluated','withdrawn') LIMIT 1`,
        [projectId, supplierId],
      );
      isRespondent = (respRows as RowDataPacket[]).length > 0;
    }
  }

  // ③ 记录级校验：非 owner/非响应方 → 仅 published+public
  const [docRows] = await pool.query(
    `SELECT id, visibility, published FROM procurement_tender_documents
      WHERE project_id = ? AND file_key = ? LIMIT 1`,
    [projectId, filename],
  );
  const doc = (docRows as Array<{ visibility: string; published: number }>)[0];
  if (!doc) routeError(404, EC_NOT_FOUND, "文件不存在");

  const allowed =
    isOwner ||
    (isRespondent && Number(doc.published) === 1) ||
    (Number(doc.published) === 1 && String(doc.visibility) === "public");
  if (!allowed) routeError(404, EC_NOT_FOUND, "文件不存在");

  const file = await getProcurementFile(filename);
  if (!file) routeError(404, EC_NOT_FOUND, "文件不存在");

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
