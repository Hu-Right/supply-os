/**
 * POST /api/user/enterprise/license-upload — 上传营业执照图片（仅存字节）
 *
 * @module app/api/user/enterprise/license-upload/route
 * @description 接收营业执照图片（multipart/form-data），字节直接入 crm_upload_files
 *              （门户与后台共享同一数据库，不落任何磁盘），返回鉴权 URL。
 *              **不直接写 supplier**——回写 supplier.license_url 与旧文件清理
 *              统一由企业保存端点（POST/PUT /api/user/enterprise）作为单一入口处理，
 *              从而覆盖新建入驻（上传时尚无 supplier_id）与移除等场景。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { saveLicenseFile, LICENSE_URL_PREFIX } from "@/lib/services/file-upload";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB，与前端压缩上限一致

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 格式上传");
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    routeError(400, EC_INVALID_PARAMS, "请选择要上传的文件");
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    routeError(400, EC_INVALID_PARAMS, `仅支持 ${ALLOWED_TYPES.join(", ")} 格式`);
  }
  if (file.size > MAX_SIZE) {
    routeError(400, EC_INVALID_PARAMS, "文件大小不能超过 5MB");
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `license_${auth.userId}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { url: licenseUrl } = await saveLicenseFile({
    filename,
    buffer,
    contentType: file.type,
    uploadedBy: auth.userId,
  });

  return NextResponse.json({ success: true, url: licenseUrl });
});
