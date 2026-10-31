/**
 * PATCH /api/rfq/[id]/reopen — 重新开启已撤回的 RFQ
 *
 * @module app/api/rfq/[id]/reopen/route
 * @description 仅创建者可操作。closed → draft（仅回草稿，不自动发布），
 *              之后需正常 submit → pending_review，发布权仍归库外审核（红线 5）。
 */
import { RFQ_STATUS } from "@/shared/constants/rfq";
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND, EC_FORBIDDEN, EC_INVALID_REQUEST, EC_INTERNAL_ERROR } from "@/shared/constants/api";

export const PATCH = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isFinite(rfqId) || rfqId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的 RFQ ID");
    }

    const ctx = getContext();

    // 权限 + 状态校验：仅已撤回(closed)可重新开启
    const row = await ctx.rfqRepo.getRfqStateById(rfqId);
    if (!row) routeError(404, EC_NOT_FOUND, "RFQ 不存在");
    if (Number(row.user_id) !== auth.userId) routeError(403, EC_FORBIDDEN, "无权操作此 RFQ");
    if (row.rfq_status !== RFQ_STATUS.CLOSED) routeError(400, EC_INVALID_REQUEST, "仅已撤回的 RFQ 可重新开启");

    // closed → draft（不写 published_date；发布仍需库外审核）
    const affected = await ctx.rfqRepo.updateRfqStatus({ rfqId, userId: auth.userId, status: RFQ_STATUS.DRAFT });

    if (affected === 0) routeError(500, EC_INTERNAL_ERROR, "重新开启失败");

    return NextResponse.json({ status: RFQ_STATUS.DRAFT });
  },
);
