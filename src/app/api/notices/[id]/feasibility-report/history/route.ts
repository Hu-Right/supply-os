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
import { createFeasibilityDeps, getReportHistory } from "@/lib/services/feasibility-report/service";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const noticePk = Number(id);
  if (!Number.isInteger(noticePk) || noticePk <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
  }
  const ctx = getContext();
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
