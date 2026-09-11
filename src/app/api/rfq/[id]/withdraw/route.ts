/**
 * PATCH /api/rfq/[id]/withdraw — 撤回已发布的 RFQ
 *
 * @module app/api/rfq/[id]/withdraw/route
 * @description 仅创建者可操作。published → closed。
 */
import { NextRequest, NextResponse } from "next/server";
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

    // 权限 + 状态校验
    const [existing] = await pool.query(
      `SELECT id, rfq_status, user_id FROM crm_bid_notices
       WHERE id = ? AND notice_type = 'RFQ' LIMIT 1`,
      [rfqId],
    );
    const row = (existing as RowDataPacket[])[0];
    if (!row) routeError(404, 40002, "RFQ 不存在");
    if (Number(row.user_id) !== auth.userId) routeError(403, 40003, "无权操作此 RFQ");
    if (row.rfq_status !== "published") routeError(400, 40004, "仅已发布的 RFQ 可撤回");

    const [result] = await pool.query(
      `UPDATE crm_bid_notices SET rfq_status = 'closed' WHERE id = ? AND user_id = ?`,
      [rfqId, auth.userId],
    );

    if ((result as ResultSetHeader).affectedRows === 0) {
      routeError(500, 50001, "撤回失败");
    }

    return NextResponse.json({ code: 0, message: "ok" });
  },
);
