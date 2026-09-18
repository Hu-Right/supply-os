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
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
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

  if (!ALLOWED_TYPES.includes(file.type)) {
    routeError(400, EC_INVALID_PARAMS, "仅支持 JPG、PNG、WebP 格式");
  }

  if (file.size > MAX_SIZE) {
    routeError(400, EC_INVALID_PARAMS, "文件大小不能超过 5MB");
  }

  // 保存文件
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `license_${auth.userId}_${Date.now()}.${ext}`;
  const uploadDir = join(process.cwd(), "public", "uploads", "license");
  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const licenseUrl = `/uploads/license/${filename}`;

  // 更新用户绑定的供应商的 license_url，并删除旧文件
  const user = await ctx.user.usersRepo.findProfileById(auth.userId);
  if (user?.supplier_id) {
    const supplierId = Number(user.supplier_id);
    const oldUrl = await ctx.supplier.directoryRepo.updateLicenseUrl(supplierId, licenseUrl);

    // 删除旧文件（如果存在且与新文件不同）
    if (oldUrl && oldUrl !== licenseUrl) {
      const oldPath = join(process.cwd(), "public", oldUrl);
      if (existsSync(oldPath)) {
        try {
          await unlink(oldPath);
        } catch (err) {
          console.warn("[license-upload] 删除旧执照文件失败:", (err as Error).message);
        }
      }
    }
  }

  return NextResponse.json({ success: true, url: licenseUrl });
});
