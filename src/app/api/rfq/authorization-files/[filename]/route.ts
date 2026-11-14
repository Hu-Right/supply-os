/**
 * GET /api/rfq/authorization-files/[filename] — 授权书签署扫描件回图
 *
 * @module app/api/rfq/authorization-files/[filename]/route
 * @description 仅归属人可读（文件名内嵌 demandId，按 rfq_demand.buyer_user_id 鉴权）。
 *              评审后台不走路由——门户与后台连同一个数据库，直接读 upload_files（ADR-0015 口径）。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { AUTH_SCAN_FILENAME_RE, getAuthScanFile } from "@/lib/services/file-upload";
import type { RowDataPacket } from "mysql2/promise";

export const GET = withRoute<{ params: Promise<{ filename: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { filename } = await params;
  if (!AUTH_SCAN_FILENAME_RE.test(filename)) {
    routeError(400, EC_INVALID_PARAMS, "非法的文件名");
  }

  // 文件名格式 auth_<demandId>_<uid>_<ts>.<ext>：demandId 即归属校验依据
  const demandId = Number(filename.split("_")[1]);
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "非法的文件名");
  }
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT buyer_user_id FROM rfq_demand WHERE id = ? LIMIT 1",
    [demandId],
  );
  const row = (rows as RowDataPacket[])[0];
  if (!row) routeError(404, EC_NOT_FOUND, "文件不存在");
  if (Number(row.buyer_user_id) !== auth.userId) {
    routeError(403, EC_FORBIDDEN, "无权查看此文件");
  }

  const file = await getAuthScanFile(filename);
  if (!file) routeError(404, EC_NOT_FOUND, "文件不存在");

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
