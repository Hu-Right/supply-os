/**
 * GET /api/rfq/demands/[id]/events — 状态时间线
 *
 * @module app/api/rfq/demands/[id]/events/route
 * @description 直接读 append-only 事件流。时间线是"正规感"最便宜的来源：
 *              每个状态变化都能回答「谁、何时、从什么到什么、为什么」。
 *              权限：仅需求所有者（采购方工作台使用）。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INVALID_PARAMS, EC_RFQ_NOT_FOUND } from "@/shared/constants/api";
import type { RowDataPacket } from "mysql2/promise";

interface EventRow extends RowDataPacket {
  id: number;
  type: string;
  actor_type: string;
  actor_id: number | null;
  from_status: string | null;
  to_status: string | null;
  payload: unknown;
  at_sec: number;
}

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");
  }

  const pool = getPool();
  const [ownerRows] = await pool.query(
    "SELECT buyer_user_id FROM rfq_demand WHERE id = ? LIMIT 1",
    [demandId],
  );
  const owner = (ownerRows as RowDataPacket[])[0];
  if (!owner) routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
  if (Number(owner.buyer_user_id) !== auth.userId) {
    routeError(403, EC_FORBIDDEN, "无权查看该需求的时间线");
  }

  const [rows] = await pool.query(
    `SELECT id, type, actor_type, actor_id, from_status, to_status, payload, at_sec
       FROM rfq_demand_event
      WHERE demand_id = ?
      ORDER BY id ASC
      LIMIT 200`,
    [demandId],
  );

  const items = (rows as EventRow[]).map((r) => ({
    id: Number(r.id),
    type: String(r.type),
    actor: String(r.actor_type),
    actorId: r.actor_id == null ? null : Number(r.actor_id),
    fromStatus: r.from_status == null ? null : String(r.from_status),
    toStatus: r.to_status == null ? null : String(r.to_status),
    at: Number(r.at_sec),
    payload: (r.payload ?? null) as Record<string, unknown> | null,
  }));

  return NextResponse.json({ items });
});
