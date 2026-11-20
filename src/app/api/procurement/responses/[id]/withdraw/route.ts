/**
 * POST /api/procurement/responses/[id]/withdraw — 截止前撤回响应
 *
 * @module app/api/procurement/responses/[id]/withdraw/route
 * @description 撤回保留原行（可再次提交）；截止后不允许撤回。
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
import { withdrawResponse } from "@/lib/services/procurement/responses";

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

  let reason: string | null;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    reason = body.reason == null ? null : String(body.reason).slice(0, 255);
  } catch {
    reason = null;
  }

  const result = await withdrawResponse(getPool(), { responseId, userId: auth.userId, reason });
  if (!result.ok) {
    switch (result.reason) {
      case "forbidden":
        routeError(403, EC_FORBIDDEN, "无权撤回该响应");
        break;
      case "not_found":
        routeError(404, EC_RFQ_RESPONSE_NOT_FOUND, "响应不存在");
        break;
      case "closed":
        routeError(409, EC_RFQ_RESPONSE_CLOSED, "已过报价截止，无法撤回");
        break;
      default:
        routeError(409, EC_RFQ_STATE_INVALID, "当前状态不允许撤回");
    }
  }

  return NextResponse.json({ ok: true, status: result.status });
});