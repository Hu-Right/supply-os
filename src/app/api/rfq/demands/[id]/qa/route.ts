/**
 * GET  /api/rfq/demands/[id]/qa — 答疑列表（公开提问所有人可见，私密提问仅本人）
 * POST /api/rfq/demands/[id]/qa — 供应商提问（published 且未截止）
 *
 * @module app/api/rfq/demands/[id]/qa/route
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
import { DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import { askQuestion, listQa } from "@/lib/services/rfq/qa";
import type { RowDataPacket } from "mysql2/promise";

interface DemandVisibilityRow extends RowDataPacket {
  buyer_user_id: number;
  status: string;
  visibility: string;
}

async function loadDemand(pool: ReturnType<typeof getPool>, demandId: number) {
  const [rows] = await pool.query(
    "SELECT buyer_user_id, status, visibility FROM rfq_demand WHERE id = ? LIMIT 1",
    [demandId],
  );
  return (rows as DemandVisibilityRow[])[0] ?? null;
}

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");

  let userId: number | null = null;
  try {
    userId = (await requireUserKeyOrThrow(req)).userId;
  } catch {
    // 未登录：只能读公开提问
  }

  const pool = getPool();
  const demand = await loadDemand(pool, demandId);
  if (!demand) routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");

  const isOwner = userId != null && Number(demand.buyer_user_id) === userId;
  const status = String(demand.status);
  const publicVisible =
    status === DEMAND_STATUS.PUBLISHED || status === DEMAND_STATUS.EVALUATION;
  if (!isOwner && !publicVisible) routeError(404, EC_RFQ_NOT_FOUND, "需求不存在或未公开");
  if (String(demand.visibility) === "targeted" && !isOwner) {
    const [rows] = await pool.query(
      `SELECT 1 FROM rfq_invitation
        WHERE demand_id = ? AND supplier_user_id = ? AND unsubscribed_at IS NULL LIMIT 1`,
      [demandId, userId ?? -1],
    );
    if ((rows as RowDataPacket[]).length === 0) {
      routeError(403, EC_FORBIDDEN, "该需求为定向邀约，你未被邀约");
    }
  }

  return NextResponse.json({ items: await listQa(pool, demandId, userId) });
});

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

  const res = await askQuestion(getPool(), {
    demandId,
    userId: auth.userId,
    question: String(body.question ?? ""),
    visibility: body.visibility === "private" ? "private" : "public",
  });

  if (!res.ok) {
    if (res.reason === "not_found") routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
    if (res.reason === "self") routeError(403, EC_FORBIDDEN, "不能对自己的需求提问");
    if (res.reason === "not_open") routeError(409, EC_RFQ_STATE_INVALID, "仅报价期内可以提问");
    routeError(400, EC_INVALID_PARAMS, "问题至少 10 个字");
  }

  return NextResponse.json({ id: res.id }, { status: 201 });
});
