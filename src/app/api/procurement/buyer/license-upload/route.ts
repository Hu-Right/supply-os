/**
 * POST /api/procurement/buyer/license-upload — 上传采购方营业执照/注册文件
 *
 * @module app/api/procurement/buyer/license-upload/route
 * @description multipart 字节入库（upload_files，buyerlic_ 前缀白名单），返回鉴权 URL；
 *              回写 buyer.license_file_key/hash 由 PUT /buyer 统一处理（单一入口口径）。
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { saveLicenseFile } from "@/lib/services/file-upload";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

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
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const { url } = await saveLicenseFile({
    filename: `license_${auth.userId}_${Date.now()}.${ext}`,
    buffer,
    contentType: file.type,
    uploadedBy: auth.userId,
  });

  /** 上传结果视图（哈希一并返回，供 PUT /buyer 回写绑定） */
  const licenseUploadViewOf = (u: string, h: string) => ({ success: true, url: u, fileHash: h });
  return NextResponse.json(licenseUploadViewOf(url, fileHash));
});
