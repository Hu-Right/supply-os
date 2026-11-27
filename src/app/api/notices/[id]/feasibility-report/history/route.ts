/**
 * GET /api/notices/:id/feasibility-report/history — 报告历史版本
 *
 * @module app/api/notices/[id]/feasibility-report/history/route
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { assertNoticeContentAccess } from "@/lib/services/notice-access";
import { BID_FEASIBILITY_REPORT_BENEFIT } from "@/lib/services/benefit-matrix";
import { createFeasibilityDeps, getReportHistory } from "@/lib/services/feasibility-report/service";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const noticePk = Number(id);
  if (!Number.isInteger(noticePk) || noticePk <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
  }
  const ctx = getContext();
    // 内容访问闸口（2026-11-18）：报告/导出/历史都包含公告正文内容，必须与 /detail 同口径：
    // 行业墙 → 套餐 → 企业版报告权益，任一不满足即 403。
    await assertNoticeContentAccess({
      dbPool: ctx.dbPool,
      benefitRepo: ctx.benefitSystemRepo,
      userId: auth.userId,
      noticeId: noticePk,
      benefit: BID_FEASIBILITY_REPORT_BENEFIT,
      benefitMessage: "投标可行性报告为企业版权益",
    });
  const versions = await getReportHistory(createFeasibilityDeps(ctx), { userId: auth.userId, noticePk });
  return NextResponse.json({
    versions: versions.map((version) => ({
      id: version.id,
      generatedAt: version.generatedAt,
      decision: version.decision,
      score: version.score,
      promptVersion: version.promptVersion,
    })),
  });
});
