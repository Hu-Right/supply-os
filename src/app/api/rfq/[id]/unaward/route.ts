/**
 * POST /api/rfq/[id]/unaward — 采购方撤销本需求的中选选定
 *
 * @module app/api/rfq/[id]/unaward/route
 * @description 仅创建者、仅 published。把 won/rejected 回退 submitted，重新开放收价；通知原中标方作废。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND, EC_FORBIDDEN } from "@/shared/constants/api";
import { unawardQuote } from "@/lib/services/rfq-quotes";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isFinite(rfqId) || rfqId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的 RFQ ID");

    const pool = getPool();
    const result = await unawardQuote(pool, { rfqId, buyerUserId: auth.userId });
    if (!result.ok) {
      if (result.reason === "not_found") routeError(404, EC_NOT_FOUND, "RFQ 不存在");
      if (result.reason === "forbidden") routeError(403, EC_FORBIDDEN, "仅创建者可撤销选定");
      if (result.reason === "closed") routeError(409, EC_FORBIDDEN, "该需求已撤回或未发布，无法撤销选定");
      routeError(409, EC_FORBIDDEN, "当前没有可撤销的中选选定");
    }

    return NextResponse.json({ revoked: true, winnerSupplierUserId: result.winnerSupplierUserId });
  },
);
