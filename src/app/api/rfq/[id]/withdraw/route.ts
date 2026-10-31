/**
 * PATCH /api/rfq/[id]/withdraw — 撤回已发布的 RFQ
 *
 * @module app/api/rfq/[id]/withdraw/route
 * @description 仅创建者可操作。published → closed。
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

    // 权限 + 状态校验
    const row = await ctx.rfqRepo.getRfqStateById(rfqId);
    if (!row) routeError(404, EC_NOT_FOUND, "RFQ 不存在");
    if (Number(row.user_id) !== auth.userId) routeError(403, EC_FORBIDDEN, "无权操作此 RFQ");
    if (row.rfq_status !== RFQ_STATUS.PUBLISHED && row.rfq_status !== RFQ_STATUS.PENDING_REVIEW) routeError(400, EC_INVALID_REQUEST, "仅已发布或待审核的 RFQ 可撤回");

    const affected = await ctx.rfqRepo.updateRfqStatus({ rfqId, userId: auth.userId, status: RFQ_STATUS.CLOSED });

    if (affected === 0) {
      routeError(500, EC_INTERNAL_ERROR, "撤回失败");
    }

    return NextResponse.json({ ok: true });
  },
);
