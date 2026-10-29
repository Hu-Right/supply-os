/**
 * GET  /api/notices/:id/feasibility-report — 读取已有报告（不触发生成）
 * POST /api/notices/:id/feasibility-report — 生成/复用报告（企业/人工档权益，BYOK）
 *
 * @module app/api/notices/[id]/feasibility-report/route
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import {
  createFeasibilityDeps,
  generateFeasibilityReport,
  getFeasibilityReportForNotice,
} from "@/lib/services/feasibility-report/service";
import { feasibilityEnterpriseViewOf, feasibilityReportViewOf } from "@/lib/services/feasibility-report/view";

function parseNoticePk(raw: string): number {
  const noticePk = Number(raw);
  if (!Number.isInteger(noticePk) || noticePk <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
  }
  return noticePk;
}

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const ctx = getContext();
  const data = await getFeasibilityReportForNotice(createFeasibilityDeps(ctx), {
    userId: auth.userId,
    noticePk: parseNoticePk(id),
  });
  return NextResponse.json({
    report: feasibilityReportViewOf(data.report),
    enterprise: feasibilityEnterpriseViewOf(data.enterprise),
  });
});

export const POST = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const ctx = getContext();
  const result = await generateFeasibilityReport(createFeasibilityDeps(ctx), {
    userId: auth.userId,
    noticePk: parseNoticePk(id),
  });
  return NextResponse.json(
    {
      report: feasibilityReportViewOf(result.report),
      cached: result.cached,
      enterprise: feasibilityEnterpriseViewOf(result.enterprise),
    },
    { status: result.cached ? 200 : 201 },
  );
});
