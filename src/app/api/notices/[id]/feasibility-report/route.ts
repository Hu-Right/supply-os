/**
 * GET  /api/notices/:id/feasibility-report — 读取已有报告（不触发生成）
 * POST /api/notices/:id/feasibility-report — 生成/复用报告（企业/人工档权益，BYOK）
 *
 * @module app/api/notices/[id]/feasibility-report/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { assertNoticeContentAccess } from "@/lib/services/notice-access";
import { BID_FEASIBILITY_REPORT_BENEFIT } from "@/lib/services/benefit-matrix";
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
  const noticePk = parseNoticePk(id);
  const ctx = getContext();
    // 内容访问闸口（2026-11-18）：报告/导出/历史都包含公告正文内容，必须与 /detail 同口径：
    // 行业墙 → 解锁/套餐 → 企业版报告权益，任一不满足即 403。
    await assertNoticeContentAccess({
      dbPool: ctx.dbPool,
      benefitRepo: ctx.benefitSystemRepo,
      accessGrantRepo: ctx.notice.accessGrantRepo,
      userId: auth.userId,
      noticeId: noticePk,
      benefit: BID_FEASIBILITY_REPORT_BENEFIT,
      benefitMessage: "投标可行性报告为企业版权益",
    });
  const data = await getFeasibilityReportForNotice(createFeasibilityDeps(ctx), {
    userId: auth.userId,
    noticePk,
  });
  return NextResponse.json({
    report: feasibilityReportViewOf(data.report),
    enterprise: feasibilityEnterpriseViewOf(data.enterprise),
    stale: data.stale,
  });
});

export const POST = withRoute<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { regenerate?: unknown };
  const regenerate = body?.regenerate === true;
  const noticePk = parseNoticePk(id);
  const ctx = getContext();
    // 内容访问闸口（2026-11-18）：报告/导出/历史都包含公告正文内容，必须与 /detail 同口径：
    // 行业墙 → 解锁/套餐 → 企业版报告权益，任一不满足即 403。
    await assertNoticeContentAccess({
      dbPool: ctx.dbPool,
      benefitRepo: ctx.benefitSystemRepo,
      accessGrantRepo: ctx.notice.accessGrantRepo,
      userId: auth.userId,
      noticeId: noticePk,
      benefit: BID_FEASIBILITY_REPORT_BENEFIT,
      benefitMessage: "投标可行性报告为企业版权益",
    });
  const result = await generateFeasibilityReport(createFeasibilityDeps(ctx), {
    userId: auth.userId,
    noticePk,
    regenerate,
  });
  return NextResponse.json(
    {
      report: feasibilityReportViewOf(result.report),
      cached: result.cached,
      enterprise: feasibilityEnterpriseViewOf(result.enterprise),
      stale: false,
    },
    { status: result.cached ? 200 : 201 },
  );
});
