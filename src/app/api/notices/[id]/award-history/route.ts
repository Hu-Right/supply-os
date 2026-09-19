/**
 * GET /api/notices/:id/award-history — 同类品类历史中标数据
 *
 * @module app/api/notices/[id]/award-history/route
 * @description 薄壳路由：参数校验 + service 委托（lib/services/awards.service）。
 *              公告 UNSPSC → 同类品类历史中标（采购次数/总额/国家分布/中标商排行/最近记录）。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { getAwardHistoryForNotice } from "@/lib/services/awards.service";

export const dynamic = "force-dynamic";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { params }) => {
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }

    const history = await getAwardHistoryForNotice(getContext().dbPool, noticeId);
    if (!history) routeError(404, 40004, "公告不存在");

    return NextResponse.json({ code: 0, data: history });
  },
);
