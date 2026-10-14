/**
 * GET /api/internal/supplier-license/[filename] — 后台内部令牌取执照原图
 *
 * @module app/api/internal/supplier-license/[filename]/route
 * @description 执照图片落在门户磁盘（runtime/uploads/license），而后台审核（供应商认领审核）
 *              与门户不同机部署时读不到本机文件；门户原图路由又有 IDOR 守卫
 *              （仅上传者本人可见），后台无门户会话必 403。故为后台开这个服务间取图端点：
 *              凭共享令牌（header x-internal-license-token == ADMIN_INTERNAL_TOKEN，恒时比较）
 *              按文件名白名单直读落盘文件流式回图。令牌未配置时端点整体关闭（一律 403），
 *              避免裸奔上线。文件读取与路径穿越防护复用 findLicenseFileByFilename。
 */
import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { findLicenseFileByFilename, LICENSE_FILENAME_RE } from "@/lib/services/file-upload";
import { EC_ACCESS_FORBIDDEN, EC_NOT_FOUND } from "@/shared/constants/api";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** 恒时比较两串令牌；长度不等直接不等（长度本身不构成敏感信息泄露面） */
function tokenMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export const GET = withRoute<{ params: Promise<{ filename: string }> }>(
  async (req: NextRequest, { params }) => {
    // 共享令牌闸口：未配置 ADMIN_INTERNAL_TOKEN 时端点整体关闭
    const expected = process.env.ADMIN_INTERNAL_TOKEN || "";
    const provided = req.headers.get("x-internal-license-token") || "";
    if (!expected || !tokenMatches(expected, provided)) {
      routeError(403, EC_ACCESS_FORBIDDEN, "无权访问");
    }

    const { filename } = await params;
    if (!LICENSE_FILENAME_RE.test(filename)) {
      routeError(404, EC_NOT_FOUND, "文件不存在");
    }

    const diskPath = findLicenseFileByFilename(filename);
    if (!diskPath) {
      routeError(404, EC_NOT_FOUND, "文件不存在");
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(diskPath!);
    } catch {
      routeError(404, EC_NOT_FOUND, "文件不存在");
    }

    const ext = diskPath!.slice(diskPath!.lastIndexOf(".")).toLowerCase();
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "Content-Length": String(buffer.length),
        // 服务间拉取的私有资料：禁缓存
        "Cache-Control": "private, no-store",
      },
    });
  },
);
