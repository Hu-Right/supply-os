/**
 * POST /api/procurement/buyer/auth-doc — 上传代理采购授权文件（F01 第 7 项）
 *
 * @module app/api/procurement/buyer/auth-doc/route
 * @description 代表第三方采购时上传授权委托书（jpg/png/webp/pdf ≤10MB），字节入
 *              upload_files（buyerauth_ 前缀白名单），返回鉴权 URL 与 sha256；
 *              回写 buyers.agent_auth_file_key/hash 统一由 PUT /buyer 完成（单一入口口径）。
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { saveBuyerAuthDoc } from "@/lib/services/file-upload";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function extOf(contentType: string): string {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 格式上传");
  }
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) routeError(400, EC_INVALID_PARAMS, "请选择要上传的文件");
  if (!ALLOWED_TYPES.includes(file.type)) {
    routeError(400, EC_INVALID_PARAMS, `仅支持 ${ALLOWED_TYPES.join(", ")} 格式`);
  }
  if (file.size > MAX_SIZE) routeError(400, EC_INVALID_PARAMS, "文件大小不能超过 10MB");

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const { url, filename } = await saveBuyerAuthDoc({
    filename: `buyerauth_${auth.userId}_${Date.now()}.${extOf(file.type)}`,
    buffer,
    contentType: file.type,
    uploadedBy: auth.userId,
  });

  /** 上传结果视图（哈希一并返回，供 PUT /buyer 回写绑定） */
  const authDocUploadViewOf = (u: string, h: string, f: string) => ({ url: u, fileHash: h, filename: f });
  return NextResponse.json(authDocUploadViewOf(url, fileHash, filename));
});
