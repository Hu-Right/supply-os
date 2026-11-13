/**
 * POST /api/rfq/demands/[id]/award — 选定供应商（定标）
 *
 * @module app/api/rfq/demands/[id]/award/route
 * @description 采购方在报价截止后选定一条报价：写 rfq_award 留痕、报价置 won/lost、
 *              需求 → closed(awarded) 并撤下搜索投影。必填授标理由（写入审计）。
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
import { awardQuote } from "@/lib/services/rfq/award";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }

  const quoteId = Number(body.quoteId);
  if (!Number.isFinite(quoteId) || quoteId <= 0) routeError(400, EC_INVALID_PARAMS, "缺少报价 ID");

  const res = await awardQuote(getPool(), {
    demandId,
    quoteId,
    buyerUserId: auth.userId,
    reason: String(body.reason ?? ""),
  });

  if (!res.ok) {
    if (res.reason === "not_found") routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
    if (res.reason === "forbidden") routeError(403, EC_FORBIDDEN, "仅需求发布者可选定供应商");
    if (res.reason === "invalid") routeError(400, EC_INVALID_PARAMS, "请填写不少于 5 个字的选定理由");
    if (res.reason === "quote_not_found") routeError(404, EC_RFQ_NOT_FOUND, "报价不存在或已撤回");
    routeError(409, EC_RFQ_STATE_INVALID, "当前状态不接受选定（需已发布或评审中）");
  }

  return NextResponse.json({ status: res.status });
});
