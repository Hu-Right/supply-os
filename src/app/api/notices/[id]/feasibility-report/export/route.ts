/**
 * GET /api/notices/:id/feasibility-report/export — 导出 Word（.docx）
 *
 * @module app/api/notices/[id]/feasibility-report/export/route
 */
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";
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
