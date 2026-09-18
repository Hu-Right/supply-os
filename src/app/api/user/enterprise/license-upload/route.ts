/**
 * POST /api/user/enterprise/license-upload — 上传营业执照图片
 *
 * @module app/api/user/enterprise/license-upload/route
 * @description 接收营业执照图片（multipart/form-data），保存到 public/uploads/license/，
 *              返回图片 URL。同时更新 supplier 表的 license_url 字段。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { saveUploadedFile, deleteFile } from "@/lib/services/file-upload";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 格式上传");
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    routeError(400, EC_INVALID_PARAMS, "请选择要上传的文件");
  }

  // 保存文件
  const { url: licenseUrl } = await saveUploadedFile(file, {
    uploadDir: "uploads/license",
    filenamePrefix: `license_${auth.userId}`,
    allowedTypes: ALLOWED_TYPES,
  });

  // 更新用户绑定的供应商的 license_url，并删除旧文件
  const user = await ctx.user.usersRepo.findProfileById(auth.userId);
  if (user?.supplier_id) {
    const supplierId = Number(user.supplier_id);
    const oldUrl = await ctx.supplier.directoryRepo.updateLicenseUrl(supplierId, licenseUrl);

    // 删除旧文件（如果存在且与新文件不同）
    if (oldUrl && oldUrl !== licenseUrl) {
      try {
        await deleteFile(oldUrl);
      } catch (err) {
        console.warn("[license-upload] 删除旧执照文件失败:", (err as Error).message);
      }
    }
  }

  return NextResponse.json({ success: true, url: licenseUrl });
});
