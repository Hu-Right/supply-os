/**
 * GET /api/supplier-diagnosis/mine — 本人诊断记录列表（回显用）
 *
 * @module app/api/supplier-diagnosis/mine/route
 * @description 规范 N5 的读侧：一个用户 × 一家公司一行，直接返回全部行供选择回显。
 *              列→作答的转换住在仓储层（diagnosisAnswersOf），与 PDF 报告同一口径；不返回 ip 等审计列。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { SupplierDiagnosisRepo, diagnosisAnswersOf } from "@/lib/repos/supplier-diagnosis.repo";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { EC_INTERNAL_ERROR } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  try {
    const rows = await new SupplierDiagnosisRepo(getPool()).findMine(auth.userId);
    return NextResponse.json({
      code: 0,
      message: "ok",
      data: {
        list: rows.map((r) => ({
          id: Number(r.id),
          supplier_id: Number(r.supplier_id),
          company_name: r.company_name,
          audit_status: r.audit_status,
          schema_version: Number(r.schema_version),
          score_total: r.score_total === null ? null : Number(r.score_total),
          score_grade: r.score_grade,
          submitted_at: r.submitted_at,
          answers: diagnosisAnswersOf(r),
        })),
      },
    });
  } catch (err) {
    console.error("[supplier-diagnosis mine GET]", err);
    routeError(500, EC_INTERNAL_ERROR, "查询诊断记录失败");
  }
});
