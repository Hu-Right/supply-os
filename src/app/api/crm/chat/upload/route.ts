/**
 * CRM 客服聊天文件上传
 *
 * POST /api/crm/chat/upload — 上传附件（图片/文件）
 *
 * 文件存储于 public/uploads/chat/，通过 Next.js 静态服务直接访问。
 * 生产环境需挂载持久化卷到此目录。
 *
 * 审查 P0-B5：新增扩展名白名单 + magic bytes 内容嗅探双重校验（此前仅
 * 校验客户端可控的 MIME，任意扩展名可落盘，存在存储型 XSS 面）。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKey } from "@/lib/middleware/auth";
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

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const limited = checkRateLimit(req, uploadLimiterConfig, () => `user:${auth.userId}`);
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { code: 40022, message: "无效的表单数据" },
      { status: 400 },
    );
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json(
      { code: 40022, message: "缺少文件" },
      { status: 400 },
    );
  }

  // 校验文件大小
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { code: 40024, message: "文件过大（最大 10MB）" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 扩展名白名单 + 内容嗅探（mime 为客户端可控值，不作为信任依据）
  const check = checkUploadFile(file.name, buffer);
  if (!check.ok) {
    return NextResponse.json(
      { code: 40023, message: check.reason ?? "不支持的文件" },
      { status: 400 },
    );
  }

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
}
