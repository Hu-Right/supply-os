/**
 * POST /api/rfq/[id]/award — 采购方选定中标供应商
 *
 * @module app/api/rfq/[id]/award/route
 * @description 仅创建者可操作。中标置 won、其余 submitted 置 rejected；不改 rfq_status（保持可搜）。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND, EC_FORBIDDEN } from "@/shared/constants/api";
import { awardQuote } from "@/lib/services/rfq-quotes";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isFinite(rfqId) || rfqId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的 RFQ ID");

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
    }
    const winnerQuoteId = Number(body.quoteId);
    if (!Number.isFinite(winnerQuoteId) || winnerQuoteId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "缺少有效的中标报价 quoteId");
    }

    const pool = getPool();
    const result = await awardQuote(pool, { rfqId, winnerQuoteId, buyerUserId: auth.userId });
    if (!result.ok) {
      if (result.reason === "not_found") routeError(404, EC_NOT_FOUND, "RFQ 不存在");
      if (result.reason === "forbidden") routeError(403, EC_FORBIDDEN, "仅创建者可选定中标");
      if (result.reason === "closed") routeError(409, EC_FORBIDDEN, "该需求已撤回或未发布，无法选定");
      if (result.reason === "self") routeError(400, EC_INVALID_PARAMS, "不能选定自己的报价为中标");
      routeError(400, EC_INVALID_PARAMS, "中标报价不存在或不可选定");
    }

    return NextResponse.json({
      code: 0,
      message: "ok",
      data: { winnerSupplierUserId: result.winnerSupplierUserId, rejectedCount: result.rejectedCount },
    });
  },
);
