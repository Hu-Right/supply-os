/**
 * CRM 客服聊天文件上传
 *
 * POST /api/crm/chat/upload — 上传附件（图片/文件）
 *
 * 文件存储于 public/uploads/chat/，通过 Next.js 静态服务直接访问。
 * 生产环境需挂载持久化卷到这个目录。
 *
 * 审查 P0-B5：新增扩展名白名单 + magic bytes 内容嗅探双重校验（此前仅
 * 校验客户端可控的 MIME，任意扩展名可落盘，存在存储型 XSS 面）。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit, getRateLimitPersistDir } from "@/lib/middleware/rateLimiter";
import { checkUploadFile } from "@/lib/utils/fileSniff";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import path from "path";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "chat");

/** 上传限流：同一用户每 10 分钟最多 20 个文件 */
const uploadLimiterConfig = {
  windowMs: 10 * 60 * 1000,
  maxAttempts: 20,
  persistFile: path.join(getRateLimitPersistDir(), "chat-upload.json"),
};

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const limited = checkRateLimit(req, uploadLimiterConfig, () => `user:${auth.userId}`);
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    routeError(400, 40022, "无效的表单数据");
  }

  const file = formData!.get("file") as File | null;
  if (!file) routeError(400, 40022, "缺少文件");

  // 校验文件大小
  if (file.size > MAX_FILE_SIZE) routeError(400, 40024, "文件过大（最大 10MB）");

  const buffer = Buffer.from(await file.arrayBuffer());

  // 扩展名白名单 + 内容嗅探（mime 为客户端可控值，不作为信任依据）
  const check = checkUploadFile(file.name, buffer);
  if (!check.ok) routeError(400, 40023, check.reason ?? "不支持的文件");

  // 生成唯一文件名（扩展名使用白名单校验后的安全值）
  const safeName = `${randomUUID()}.${check.safeExt}`;

  // 确保目录存在
  await mkdir(UPLOAD_DIR, { recursive: true });

  // 写入文件
  const filePath = join(UPLOAD_DIR, safeName);
  await writeFile(filePath, buffer);

  // 返回可访问的 URL
  return NextResponse.json(
    {
      url: `/uploads/chat/${safeName}`,
      name: file.name,
      size: file.size,
      type: file.type,
    },
    { status: 201 },
  );
});
