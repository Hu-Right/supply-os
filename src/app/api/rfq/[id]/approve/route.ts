/**
 * PATCH /api/rfq/[id]/approve — 审核通过 RFQ
 *
 * @module app/api/rfq/[id]/approve/route
 * @description 管理员审核通过 pending_review → published。
 *              当前阶段：任何登录用户可调用（后续接入管理员权限）。
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

    // 状态校验
    const [existing] = await pool.query(
      `SELECT id, rfq_status FROM crm_bid_notices
       WHERE id = ? AND notice_type = 'RFQ' LIMIT 1`,
      [rfqId],
    );
    const row = (existing as RowDataPacket[])[0];
    if (!row) routeError(404, 40002, "RFQ 不存在");
    if (row.rfq_status !== "pending_review") {
      routeError(400, 40003, "仅待审核状态可通过");
    }

    const [result] = await pool.query(
      `UPDATE crm_bid_notices SET rfq_status = 'published' WHERE id = ?`,
      [rfqId],
    );

    if ((result as ResultSetHeader).affectedRows === 0) {
      routeError(500, 50001, "审核失败");
    }

    return NextResponse.json({ code: 0, message: "ok" });
  },
);
