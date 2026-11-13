/**
 * POST /api/rfq/demands/[id]/qa/[qaId]/answer — 采购方答复提问
 *
 * @module app/api/rfq/demands/[id]/qa/[qaId]/answer/route
 * @description 仅需求所有者可答复；答复后对所有可见方展示（公开提问）或仅提问者（私密）。
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
import { answerQuestion } from "@/lib/services/rfq/qa";

export const POST = withRoute<{ params: Promise<{ id: string; qaId: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id, qaId } = await params;
    const demandId = Number(id);
    const questionId = Number(qaId);
    if (!Number.isFinite(demandId) || demandId <= 0 || !Number.isFinite(questionId) || questionId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的请求参数");
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
    }

    const res = await answerQuestion(getPool(), {
      demandId,
      qaId: questionId,
      buyerUserId: auth.userId,
      answer: String(body.answer ?? ""),
    });

    if (!res.ok) {
      if (res.reason === "not_found") routeError(404, EC_RFQ_NOT_FOUND, "提问不存在");
      if (res.reason === "forbidden") routeError(403, EC_FORBIDDEN, "仅需求发布者可答复");
      if (res.reason === "already_answered") routeError(409, EC_RFQ_STATE_INVALID, "该提问已答复");
      routeError(400, EC_INVALID_PARAMS, "答复内容不能为空");
    }

    return NextResponse.json({ ok: true });
  },
);
