/**
 * GET /api/notices/:id/feasibility-report/export — 导出 Word（.docx）
 *
 * @module app/api/notices/[id]/feasibility-report/export/route
 */
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
import { assertNoticeContentAccess } from "@/lib/services/notice-access";
import { BID_FEASIBILITY_REPORT_BENEFIT } from "@/lib/services/benefit-matrix";
import { createFeasibilityDeps, getFeasibilityReportForNotice } from "@/lib/services/feasibility-report/service";
import { buildFeasibilityReportDocx } from "@/lib/services/feasibility-report/docx";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const noticePk = Number(id);
  if (!Number.isInteger(noticePk) || noticePk <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
  }
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
  const deps = createFeasibilityDeps(ctx);
  const data = await getFeasibilityReportForNotice(deps, { userId: auth.userId, noticePk });
  if (!data.report) routeError(404, EC_NOT_FOUND, "请先生成投标可行性报告，再导出 Word");

  const notice = await deps.repo.getNotice(noticePk);
  const buffer = await buildFeasibilityReportDocx(data.report, {
    noticeTitle: notice?.title ?? null,
    exportedAt: new Date().toISOString(),
  });
  const filename = `feasibility-report-${noticePk}-${new Date().toISOString().slice(0, 10)}.docx`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
