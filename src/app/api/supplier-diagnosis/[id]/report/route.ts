/**
 * GET /api/supplier-diagnosis/[id]/report — 生成 v2 能力诊断报告 PDF
 *
 * @module app/api/supplier-diagnosis/[id]/report/route
 * @description 报告**只读快照**：分数与维度直接取落库时的 score_breakdown，不重新评分 ——
 *              评分规则日后调整也不会让历史报告口径漂移。
 *              越权一律 404（不区分"不存在"与"无权"，避免通过状态码探测他人记录 id）。
 *              鉴权与归属校验放在 try 之外：否则 routeError 抛出的 404 会被下面的 catch
 *              统一降级成 500，把"没登录/不是你的"报成"服务器错误"。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { SupplierDiagnosisRepo, diagnosisAnswersOf } from "@/lib/repos/supplier-diagnosis.repo";
import { generateDiagnosisPdf, type ReportDimension } from "@/lib/services/diagnosis-report-pdf";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INTERNAL_ERROR } from "@/shared/constants/api";

interface Snapshot {
  dimensions?: ReportDimension[];
  overrideGateTriggered?: boolean;
  overrideGateReason?: string;
}

/** score_breakdown 是 JSON 列：驱动可能已反序列化，也可能回传字符串 */
function parseSnapshot(raw: unknown): Snapshot {
  if (!raw) return {};
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    // 早期版本只存维度数组，保留兼容读法（表内当前 0 行，仅为防御）
    if (Array.isArray(value)) return { dimensions: value as ReportDimension[] };
    return (value ?? {}) as Snapshot;
  } catch {
    return {};
  }
}

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) routeError(400, 40000, "无效的记录 ID");

    const row = await new SupplierDiagnosisRepo(getPool()).findById(id);
    if (!row || Number(row.user_id) !== auth.userId) routeError(404, 40400, "未找到该记录");

    const snapshot = parseSnapshot(row.score_breakdown);
    const dimensions = snapshot.dimensions ?? [];
    if (dimensions.length === 0) {
      routeError(409, 40900, "该记录缺少评分快照，请重新提交一次诊断");
    }

    try {
      const pdf = await generateDiagnosisPdf({
        id: Number(row.id),
        companyName: row.company_name,
        assessDate: new Date(row.submitted_at).toISOString().slice(0, 10),
        totalScore: Number(row.score_total ?? 0),
        grade: String(row.score_grade ?? "C"),
        dimensions,
        answers: diagnosisAnswersOf(row),
        overrideGate: {
          triggered: Boolean(snapshot.overrideGateTriggered),
          reason: snapshot.overrideGateReason ?? "",
        },
      });

      const safeName = String(row.company_name || "supplier").replace(/[\\/:*?"<>|]/g, "_");
      const fileName = `国际公共采购能力诊断报告_${safeName}.pdf`;

      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          // 中文文件名需 RFC 5987 编码，同时给 ASCII 兜底
          "Content-Disposition": `attachment; filename="diagnosis-report.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          "Content-Length": String(pdf.length),
        },
      });
    } catch (err) {
      console.error("[supplier-diagnosis report]", err);
      routeError(500, EC_INTERNAL_ERROR, "生成报告失败");
    }
  },
);
