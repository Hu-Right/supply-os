/**
 * POST /api/rfq/demands/[id]/unaward — 撤销选定
 *
 * @module app/api/rfq/demands/[id]/unaward/route
 * @description 授标行保留（revoked_at + 理由），需求从 closed(awarded) 回到 evaluation，
 *              报价恢复 submitted，可重新比价选定。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
} from "@/shared/constants/api";
import { unawardQuote } from "@/lib/services/rfq/award";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // 允许空体
  }

  const res = await unawardQuote(getPool(), {
    demandId,
    buyerUserId: auth.userId,
    reason: body.reason == null ? null : String(body.reason),
  });

  if (!res.ok) {
    if (res.reason === "not_found") routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
    if (res.reason === "forbidden") routeError(403, EC_FORBIDDEN, "仅需求发布者可撤销选定");
    if (res.reason === "no_award") routeError(409, EC_RFQ_STATE_INVALID, "该需求当前没有生效的选定");
    routeError(409, EC_RFQ_STATE_INVALID, "当前状态不支持撤销选定");
  }

  return NextResponse.json({ status: res.status });
});
