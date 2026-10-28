/**
 * PATCH /api/rfq/[id]/submit — 将 RFQ 草稿提交为已发布
 *
 * @module app/api/rfq/[id]/submit/route
 * @description 仅 RFQ 创建者（user_id 匹配）可将 draft → published。
 */
import { RFQ_STATUS } from "@/shared/constants/rfq";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND, EC_FORBIDDEN, EC_INVALID_REQUEST, EC_INTERNAL_ERROR } from "@/shared/constants/api";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

export const PATCH = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isFinite(rfqId) || rfqId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的 RFQ ID");
    }

    // submit 只允许 draft/rejected → pending_review；published 由库外审核写入（红线 5）。
    // 不解析 body.status：接受客户端自发布 = 绕过审核的完整性漏洞。
    const newStatus = RFQ_STATUS.PENDING_REVIEW;

    const pool = getPool();

    // 权限校验：仅创建者可操作
    const [existing] = await pool.query(
      `SELECT id, rfq_status, user_id FROM bid_notices
       WHERE id = ? AND notice_type = 'RFQ' LIMIT 1`,
      [rfqId],
    );
    const row = (existing as RowDataPacket[])[0];
    if (!row) routeError(404, EC_NOT_FOUND, "RFQ 不存在");
    if (Number(row.user_id) !== auth.userId) {
      routeError(403, EC_FORBIDDEN, "无权操作此 RFQ");
    }
    if (row.rfq_status === RFQ_STATUS.CLOSED) {
      routeError(400, EC_INVALID_REQUEST, "已撤回的 RFQ 无法重新提交");
    }
    // 已发布 / 已在待审：幂等放行，不回退状态、不改内容（published 由库外审核维护）
    if (
      row.rfq_status === RFQ_STATUS.PUBLISHED ||
      row.rfq_status === RFQ_STATUS.PENDING_REVIEW
    ) {
      return NextResponse.json({ status: row.rfq_status });
    }
    // 仅 draft / rejected 走到这里：提交为待审核（不写 published_date，那是审核时点）
    const [result] = await pool.query(
      `UPDATE bid_notices SET rfq_status = ? WHERE id = ? AND user_id = ?`,
      [newStatus, rfqId, auth.userId],
    );

    const affected = (result as ResultSetHeader).affectedRows;
    if (affected === 0) routeError(500, EC_INTERNAL_ERROR, "更新失败");

    return NextResponse.json({ status: newStatus });
  },
);
