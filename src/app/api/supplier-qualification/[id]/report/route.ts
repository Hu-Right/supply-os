/**
 * GET /api/supplier-qualification/[id]/report — 生成供应商就绪度评估报告 PDF
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { SupplierQualificationRepo } from "@/lib/repos/supplier-qualification.repo";
import { generateReadinessPdf } from "@/lib/services/supplier-readiness-pdf";
import type { QualificationScoreInput } from "@/features/procurement/utils/scoringEngine";

/**
 * 将 DB 行转换为评分引擎输入（逗号分隔字符串 → 数组）
 */
function toScoreInput(row: Record<string, unknown>): QualificationScoreInput {
  const toArray = (v: string | null) =>
    v ? v.split(/,\s*/).filter(Boolean) : [];

  return {
    company_name: String(row.company_name ?? ""),
    company_website: String(row.company_website ?? ""),
    founding_year: row.founding_year ? String(row.founding_year) : "",
    employee_count: row.employee_count ? String(row.employee_count) : "",
    industry: toArray(String(row.industry ?? "")),
    other_industry: row.other_industry ? String(row.other_industry) : "",
    main_product: String(row.main_product ?? ""),
    export_scale: String(row.export_scale ?? ""),
    certifications: toArray(String(row.certifications ?? "")),
    other_certifications: row.other_certifications ? String(row.other_certifications) : "",
    service_countries: String(row.service_countries ?? ""),
    overseas_companies: String(row.overseas_companies ?? ""),
    ungm_status: String(row.ungm_status ?? ""),
    english_team: String(row.english_team ?? ""),
    payment_terms: String(row.payment_terms ?? ""),
    bid_willingness: String(row.bid_willingness ?? ""),
    contact_info: row.contact_info ? String(row.contact_info) : "",
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ code: 40000, message: "无效的记录 ID" }, { status: 400 });
  }

  const repo = new SupplierQualificationRepo(getPool());

  try {
    const row = await repo.findById(id);
    if (!row) {
      return NextResponse.json({ code: 40400, message: "未找到该记录" }, { status: 404 });
    }

    const scoreInput = toScoreInput(row as unknown as Record<string, unknown>);
    const pdfBuffer = await generateReadinessPdf({
      ...scoreInput,
      id: row.id,
      assessDate: new Date().toISOString().slice(0, 10),
    });

    const fileName = `supplier-readiness-${String(row.id).padStart(6, "0")}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("[supplier-qualification-report]", err);
    return NextResponse.json(
      { code: 50000, message: "生成报告失败" },
      { status: 500 },
    );
  }
}
