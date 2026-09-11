/**
 * PATCH /api/rfq/[id]/submit — 将 RFQ 草稿提交为已发布
 *
 * @module app/api/rfq/[id]/submit/route
 * @description 仅 RFQ 创建者（user_id 匹配）可将 draft → published。
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

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      routeError(400, 40002, "请求体非法 JSON");
    }

    const newStatus = body.status === "published" ? "published" : "draft";

    const pool = getPool();

    // 权限校验：仅创建者可操作
    const [existing] = await pool.query(
      `SELECT id, rfq_status, user_id FROM crm_bid_notices
       WHERE id = ? AND notice_type = 'RFQ' LIMIT 1`,
      [rfqId],
    );
    const row = (existing as RowDataPacket[])[0];
    if (!row) routeError(404, 40003, "RFQ 不存在");
    if (Number(row.user_id) !== auth.userId) {
      routeError(403, 40004, "无权操作此 RFQ");
    }
    if (row.rfq_status === "published" && newStatus === "published") {
      // 幂等：已发布的不再重复更新
      return NextResponse.json({ code: 0, message: "ok", already_published: true });
    }

    const [result] = await pool.query(
      `UPDATE crm_bid_notices SET rfq_status = ? WHERE id = ? AND user_id = ?`,
      [newStatus, rfqId, auth.userId],
    );

    const affected = (result as ResultSetHeader).affectedRows;
    if (affected === 0) routeError(500, 50001, "更新失败");

    return NextResponse.json({ code: 0, message: "ok" });
  },
);
