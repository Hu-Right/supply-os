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
import { hasFeature } from "@/lib/services/benefit-matrix";

export const dynamic = "force-dynamic";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }

    // 档位闸门：历史中标为标准版（999）起享权益（单一事实源 benefit-matrix）
    const ctx = getContext();
    const current = await ctx.user.membershipRepo.findCurrentBestPlan(auth.userId);
    if (!hasFeature(Number(current?.benefit_rank ?? 0), "award_history")) {
      routeError(403, EC_VIP_ONLY, "历史中标为标准版及以上权益", {
        feature: "award_history",
        required_rank: 2,
      });
    }

    const history = await getAwardHistoryForNotice(ctx.dbPool, noticeId);
    if (!history) routeError(404, 40004, "公告不存在");

    return NextResponse.json({ code: 0, data: history });
  },
);
