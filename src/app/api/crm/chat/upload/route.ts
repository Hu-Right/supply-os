/**
 * CRM 客服聊天文件上传
 *
 * POST /api/crm/chat/upload — 上传附件（图片/文件）
 *
 * 文件存储于 public/uploads/chat/，通过 Next.js 静态服务直接访问。
 * 生产环境需挂载持久化卷到此目录。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKey } from "@/lib/middleware/auth";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** 允许的文件类型及大小限制 */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-rar-compressed",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "chat");

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

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

  // 校验文件类型
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { code: 40023, message: `不支持的文件类型: ${file.type || "unknown"}` },
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

  // 生成唯一文件名
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const safeName = `${randomUUID()}.${ext}`;

  // 确保目录存在
  await mkdir(UPLOAD_DIR, { recursive: true });

  // 写入文件
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(UPLOAD_DIR, safeName);
  await writeFile(filePath, buffer);

  // 返回可访问的 URL
  const url = `/uploads/chat/${safeName}`;

  return NextResponse.json(
    {
      url,
      name: file.name,
      size: file.size,
      type: file.type,
    },
    { status: 201 },
  );
}
