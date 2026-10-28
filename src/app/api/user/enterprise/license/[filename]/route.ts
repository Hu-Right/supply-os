/**
 * GET /api/user/enterprise/license/[filename] — 鉴权回显营业执照图片
 *
 * @module app/api/user/enterprise/license/[filename]/route
 * @description 执照字节存于 upload_files（门户与后台共享同一数据库，不落任何磁盘），
 *              此处按文件名取库回图。文件名格式 license_<userId>_<ts>.<ext> 内嵌上传者
 *              uid，鉴权口径为「文件名中的 uid == 当前登录用户」——既杜绝越权（IDOR），
 *              又不依赖企业绑定状态（新用户入驻上传后、尚未保存企业即可预览自己的执照）。
 *              <img> 无法携带 Authorization 头，故前端经 core/http 拉 Blob → objectURL。
 */
import { NextRequest } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { getLicenseFile, parseLicenseUid, LICENSE_FILENAME_RE } from "@/lib/services/file-upload";
import { EC_ACCESS_FORBIDDEN, EC_NOT_FOUND } from "@/shared/constants/api";

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

    const file = await getLicenseFile(filename);
    if (!file) {
      routeError(404, EC_NOT_FOUND, "文件不存在");
    }

    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.buffer.length),
        // 私有鉴权资源：仅私有短缓存，禁止共享/持久缓存
        "Cache-Control": "private, max-age=300",
      },
    });
  },
);
