/**
 * GET /api/user/enterprise/license/[filename] — 鉴权回显营业执照图片
 *
 * @module app/api/user/enterprise/license/[filename]/route
 * @description 执照已从 public/ 静态目录迁出（企业敏感资料，且 standalone 每次重新部署 cp -rT
 *              会整体替换 public 抹掉运行时文件），改存仓库根 runtime/uploads/license/。
 *              文件名格式 license_<userId>_<ts>.<ext> 已内嵌上传者 uid，故鉴权口径为
 *              「文件名中的 uid == 当前登录用户」——既杜绝越权（IDOR），又不依赖企业绑定
 *              状态（新用户入驻上传后、尚未保存企业即可预览自己的执照）。
 *              <img> 无法携带 Authorization 头，故前端经 core/http 拉 Blob → objectURL。
 */
import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import nodePath from "node:path";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  findLicenseFileByFilename,
  parseLicenseUid,
  LICENSE_FILENAME_RE,
} from "@/lib/services/file-upload";
import { EC_ACCESS_FORBIDDEN, EC_NOT_FOUND } from "@/shared/constants/api";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export const GET = withRoute<{ params: Promise<{ filename: string }> }>(
  async (req: NextRequest, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { filename } = await params;

    // 文件名白名单（拒绝路径穿越/非法字符）
    if (!LICENSE_FILENAME_RE.test(filename)) {
      routeError(404, EC_NOT_FOUND, "文件不存在");
    }

    // 归属校验：文件名内嵌的上传者 uid 必须等于当前登录用户
    if (parseLicenseUid(filename) !== Number(auth.userId)) {
      routeError(403, EC_ACCESS_FORBIDDEN, "无权访问");
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

    const ext = nodePath.extname(diskPath!).toLowerCase();
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "Content-Length": String(buffer.length),
        // 私有鉴权资源：仅私有短缓存，禁止共享/持久缓存
        "Cache-Control": "private, max-age=300",
      },
    });
  },
);
