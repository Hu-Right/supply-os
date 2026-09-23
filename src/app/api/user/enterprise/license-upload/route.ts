/**
 * POST /api/user/enterprise/license-upload — 上传营业执照图片（仅存字节）
 *
 * @module app/api/user/enterprise/license-upload/route
 * @description 接收营业执照图片（multipart/form-data），落盘到仓库根 runtime/uploads/license/
 *              （不在 public/ 内：standalone 部署每次 cp -rT 替换 public 会抹掉运行时文件），
 *              返回鉴权 URL。**不直接写库**——回写 supplier.license_url 与旧文件清理
 *              统一由企业保存端点（POST/PUT /api/user/enterprise）作为单一入口处理，
 *              从而覆盖新建入驻（上传时尚无 supplier_id）与移除等场景。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { saveUploadedFile, licenseUploadDir, LICENSE_URL_PREFIX } from "@/lib/services/file-upload";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

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

  // 仅保存文件（绝对目录 → 仓库根 runtime/，不受 standalone cwd 与重新部署影响）
  const { url: licenseUrl } = await saveUploadedFile(file, {
    uploadDir: licenseUploadDir(),
    filenamePrefix: `license_${auth.userId}`,
    allowedTypes: ALLOWED_TYPES,
    urlPrefix: LICENSE_URL_PREFIX,
  });

  return NextResponse.json({ success: true, url: licenseUrl });
});
