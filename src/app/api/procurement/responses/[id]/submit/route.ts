/**
 * POST /api/procurement/responses/[id]/submit — 提交并密封，生成回执
 *
 * @module app/api/procurement/responses/[id]/submit/route
 * @description 提交后响应内容锁定（仅本人可见），回执编号/哈希可自证；重复提交幂等。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_RESPONSE_CLOSED,
  EC_RFQ_RESPONSE_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
} from "@/shared/constants/api";
import { extractClientIp } from "@/lib/utils/ip";
import { submitResponse } from "@/lib/services/procurement/responses";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const responseId = Number(id);
  if (!Number.isFinite(responseId) || responseId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的响应 ID");
  }

  const result = await submitResponse(getPool(), {
    responseId,
    userId: auth.userId,
    clientIp: extractClientIp(req),
    userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "forbidden":
        routeError(403, EC_FORBIDDEN, "无权提交该响应");
        break;
      case "not_found":
        routeError(404, EC_RFQ_RESPONSE_NOT_FOUND, "响应不存在");
        break;
      case "closed":
        routeError(409, EC_RFQ_RESPONSE_CLOSED, "已过报价截止，无法提交");
        break;
      case "no_items":
        routeError(400, EC_INVALID_PARAMS, "至少需要一条含单价的报价明细");
        break;
      case "eoi_content_required":
        routeError(400, EC_INVALID_PARAMS, "意向征集响应需至少填写意向说明或上传一份资质文件");
        break;
      default:
        routeError(409, EC_RFQ_STATE_INVALID, "当前状态不允许提交");
    }
  }

  return NextResponse.json({
    ok: true,
    responseId: result.responseId,
    status: result.status,
    receiptNo: result.receiptNo,
    receiptHash: result.receiptHash,
    submittedAt: result.submittedAt,
    duplicate: result.duplicate ?? false,
  });
});