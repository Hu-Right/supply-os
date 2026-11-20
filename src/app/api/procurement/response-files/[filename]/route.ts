/**
 * GET /api/procurement/response-files/[filename] — 响应附件下载（鉴权）
 *
 * @module app/api/procurement/response-files/[filename]/route
 * @description 允许：响应提交人 / 同一供应商绑定账号 / 已开标后的采购方。
 *              密封期采购方与第三方一律 404（不暴露附件是否存在）。
 */
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { PROCUREMENT_FILE_FILENAME_RE, getProcurementFile } from "@/lib/services/file-upload";
import { resolveSupplierIdForUser } from "@/lib/services/procurement/responses";

interface Ctx {
  params: Promise<{ filename: string }>;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { filename } = await params;
  if (!PROCUREMENT_FILE_FILENAME_RE.test(filename)) {
    routeError(400, EC_INVALID_PARAMS, "非法文件名");
  }

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT f.id, r.user_id AS response_user_id, r.supplier_id, r.project_id,
            t.status AS tender_status, t.opened_ts
       FROM procurement_response_files f
       JOIN procurement_responses r ON r.id = f.response_id
       JOIN procurement_tenders t ON t.id = r.tender_id
      WHERE f.file_key = ?
      LIMIT 1`,
    [filename],
  );
  const row = (rows as RowDataPacket[])[0] as
    | {
        response_user_id: number;
        supplier_id: number;
        project_id: number;
        tender_status: string;
        opened_ts: number | null;
      }
    | undefined;
  if (!row) routeError(404, EC_NOT_FOUND, "文件不存在");

  const isSubmitter = Number(row.response_user_id) === Number(auth.userId);
  const supplierId = isSubmitter ? null : await resolveSupplierIdForUser(pool, auth.userId);
  const sameSupplier = supplierId != null && Number(row.supplier_id) === supplierId;

  let allowed = isSubmitter || sameSupplier;
  if (!allowed) {
    const [buyerRows] = await pool.query(
      `SELECT p.id FROM procurement_projects p
         JOIN procurement_buyers b ON b.id = p.buyer_id
        WHERE p.id = ? AND b.user_id = ? LIMIT 1`,
      [row.project_id, auth.userId],
    );
    const isBuyer = (buyerRows as RowDataPacket[]).length > 0;
    const opened = String(row.tender_status) !== "published" || row.opened_ts != null;
    allowed = isBuyer && opened;
  }
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