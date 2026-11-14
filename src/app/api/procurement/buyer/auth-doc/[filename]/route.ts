/**
 * GET /api/procurement/buyer/auth-doc/[filename] — 代理采购授权文件回读（仅上传者本人）
 *
 * @module app/api/procurement/buyer/auth-doc/[filename]/route
 * @description 文件名 buyerauth_<uid>_<ts>.<ext>，uid 内嵌用于鉴权；评审后台不走路由，
 *              直连同库 upload_files（ADR-0015 口径）。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import {
  BUYER_AUTH_DOC_FILENAME_RE,
  getBuyerAuthDoc,
  parseBuyerAuthDocUid,
} from "@/lib/services/file-upload";

interface Ctx {
  params: Promise<{ filename: string }>;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { filename } = await params;
  if (!BUYER_AUTH_DOC_FILENAME_RE.test(filename)) {
    routeError(400, EC_INVALID_PARAMS, "非法的文件名");
  }
  if (parseBuyerAuthDocUid(filename) !== auth.userId) {
    routeError(403, EC_FORBIDDEN, "无权查看该文件");
  }
  const file = await getBuyerAuthDoc(filename);
  if (!file) routeError(404, EC_NOT_FOUND, "文件不存在");

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
