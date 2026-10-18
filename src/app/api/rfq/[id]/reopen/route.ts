/**
 * PATCH /api/rfq/[id]/reopen — 重新开启已撤回的 RFQ
 *
 * @module app/api/rfq/[id]/reopen/route
 * @description 仅创建者可操作。closed → draft（仅回草稿，不自动发布），
 *              之后需正常 submit → pending_review，发布权仍归库外审核（红线 5）。
 */
import { RFQ_STATUS } from "@/shared/constants/rfq";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

export const PATCH = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isFinite(rfqId) || rfqId <= 0) {
      routeError(400, 40001, "无效的 RFQ ID");
    }

    const pool = getPool();

    // 权限 + 状态校验：仅已撤回(closed)可重新开启
    const [existing] = await pool.query(
      `SELECT id, rfq_status, user_id FROM crm_bid_notices
       WHERE id = ? AND notice_type = 'RFQ' LIMIT 1`,
      [rfqId],
    );
    const row = (existing as RowDataPacket[])[0];
    if (!row) routeError(404, 40002, "RFQ 不存在");
    if (Number(row.user_id) !== auth.userId) routeError(403, 40003, "无权操作此 RFQ");
    if (row.rfq_status !== RFQ_STATUS.CLOSED) routeError(400, 40004, "仅已撤回的 RFQ 可重新开启");

    // closed → draft（不写 published_date；发布仍需库外审核）
    const [result] = await pool.query(
      `UPDATE crm_bid_notices SET rfq_status = ? WHERE id = ? AND user_id = ?`,
      [RFQ_STATUS.DRAFT, rfqId, auth.userId],
    );

    if ((result as ResultSetHeader).affectedRows === 0) routeError(500, 50001, "重新开启失败");

    return NextResponse.json({ code: 0, message: "ok", status: RFQ_STATUS.DRAFT });
  },
);
