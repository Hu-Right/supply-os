/**
 * POST /api/rfq/demands/[id]/unsubmit — 撤回提交（submitted → draft）
 *
 * @module app/api/rfq/demands/[id]/unsubmit/route
 * @description 与"撤回需求"（→ closed）区分：撤回提交只是把需求退回草稿继续修改，
 *              仅当审核方尚未领取（仍为 submitted）时可用；已领取则必须走取消。
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
import { DEMAND_ACTOR, DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import { transitionDemand } from "@/lib/services/rfq/lifecycle";
import type { RowDataPacket } from "mysql2/promise";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");
  }

  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT buyer_user_id FROM rfq_demand WHERE id = ? LIMIT 1",
    [demandId],
  );
  const row = (rows as RowDataPacket[])[0];
  if (!row) routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
  if (Number(row.buyer_user_id) !== auth.userId) {
    routeError(403, EC_FORBIDDEN, "无权操作此需求");
  }

  const result = await transitionDemand(pool, {
    demandId,
    to: DEMAND_STATUS.DRAFT,
    actor: DEMAND_ACTOR.BUYER,
    actorId: auth.userId,
  });

  if (!result.ok) {
    if (result.reason === "illegal_transition" || result.reason === "actor_not_allowed") {
      routeError(409, EC_RFQ_STATE_INVALID, "审核已领取或需求已变更，无法撤回提交");
    }
    routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
  }

  return NextResponse.json({ status: result.status });
});
