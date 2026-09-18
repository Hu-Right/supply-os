/**
 * 文件上传服务
 * File Upload Service
 *
 * @module lib/services/file-upload
 * @description 收口文件上传逻辑：验证、保存、返回 URL。
 *              支持图片类型验证和大小限制。
 */
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

export interface UploadResult {
  url: string;
  filename: string;
}

export interface UploadOptions {
  /** 上传目录（相对于 public/） */
  uploadDir: string;
  /** 文件名前缀 */
  filenamePrefix: string;
  /** 允许的文件类型 */
  allowedTypes: string[];
  /** 最大文件大小（字节） */
  maxSize: number;
}

const DEFAULT_OPTIONS: UploadOptions = {
  uploadDir: "uploads",
  filenamePrefix: "file",
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
  maxSize: 5 * 1024 * 1024, // 5MB
};

/**
 * 保存上传文件到 public/uploads/ 目录
 * @param file - 上传的文件
 * @param options - 上传选项
 * @returns 上传结果（URL 和文件名）
 */
export async function saveUploadedFile(
  file: File,
  options: Partial<UploadOptions> = {},
): Promise<UploadResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 验证文件类型
  if (!opts.allowedTypes.includes(file.type)) {
    throw new Error(`仅支持 ${opts.allowedTypes.join(", ")} 格式`);
  }

  // 验证文件大小
  if (file.size > opts.maxSize) {
    throw new Error(`文件大小不能超过 ${Math.round(opts.maxSize / 1024 / 1024)}MB`);
  }

  // 生成文件名
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${opts.filenamePrefix}_${Date.now()}.${ext}`;

  // 保存文件
  const uploadDir = join(process.cwd(), "public", opts.uploadDir);
  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return {
    url: `/${opts.uploadDir}/${filename}`,
    filename,
  };
}

/**
 * 删除文件（如果存在）
 * @param url - 文件 URL（如 /uploads/license/xxx.jpg）
 */
export async function deleteFile(url: string): Promise<void> {
  const filePath = join(process.cwd(), "public", url);
  if (existsSync(filePath)) {
    await unlink(filePath);
  }
}
