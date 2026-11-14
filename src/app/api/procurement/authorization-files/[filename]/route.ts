/**
 * GET /api/procurement/authorization-files/[filename] — 授权书扫描件回图（归属人）
 *
 * @module app/api/procurement/authorization-files/[filename]/route
 * @description 文件名 authscan_<projectId>_<uid>_<ts>.<ext>，按项目归属（buyers.user_id）
 *              鉴权。评审后台不走路由——直连同库 upload_files（ADR-0015 口径）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { PROCUREMENT_SCAN_FILENAME_RE, getProcurementScan } from "@/lib/services/file-upload";
import type { RowDataPacket } from "mysql2/promise";

interface Ctx {
  params: Promise<{ filename: string }>;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { filename } = await params;
  if (!PROCUREMENT_SCAN_FILENAME_RE.test(filename)) {
    routeError(400, EC_INVALID_PARAMS, "非法的文件名");
  }
  const projectId = Number(filename.split("_")[1]);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "非法的文件名");
  }
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT p.id FROM procurement_projects p
      JOIN procurement_buyers b ON b.id = p.buyer_id
      WHERE p.id = ? AND b.user_id = ? LIMIT 1`,
    [projectId, auth.userId],
  );
  if ((rows as RowDataPacket[]).length === 0) {
    routeError(404, EC_NOT_FOUND, "文件不存在");
  }
  const file = await getProcurementScan(filename);
  if (!file) routeError(404, EC_NOT_FOUND, "文件不存在");

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
