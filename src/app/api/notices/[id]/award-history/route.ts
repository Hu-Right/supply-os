/**
 * GET /api/notices/:id/award-history — 同类品类历史中标数据
 *
 * @module app/api/notices/[id]/award-history/route
 * @description 薄壳路由：参数校验 + service 委托（lib/services/awards.service）。
 *              公告 UNSPSC → 同类品类历史中标（采购次数/总额/国家分布/中标商排行/最近记录）。
 *              V2 权益（2026-09-21）：标准档（benefit_rank≥2）专享，此前该接口无鉴权，
 *              UI 标"专业版"但公开可调，属越权漏洞，已补闸门。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_VIP_ONLY } from "@/shared/constants/api";
import { getAwardHistoryForNotice } from "@/lib/services/awards.service";

export const dynamic = "force-dynamic";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }

    // 权益闸门：历史中标对应矩阵 history_notice_db（历史标讯库）行
    const ctx = getContext();
    if (!(await ctx.benefitSystemRepo.isEntitled(auth.userId, "history_notice_db"))) {
      routeError(403, EC_VIP_ONLY, "历史中标查询为该档不包含的权益", {
        feature: "history_notice_db",
        benefit_code: "history_notice_db",
      });
    }

    const history = await getAwardHistoryForNotice(ctx.dbPool, noticeId);
    if (!history) routeError(404, 40004, "公告不存在");

    return NextResponse.json({ code: 0, data: history });
  },
);
