/**
 * GET /api/supplier-qualification/[id]/report — 生成国际公采能力诊断报告 PDF
 *
 * 完整 12 章节诊断报告，包含企业画像、标准认证、UNSPSC映射、风险评估、
 * 市场策略、KPI建议、90天行动计划、综合结论等。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { SupplierQualificationRepo } from "@/lib/repos/supplier-qualification.repo";
import { generateReadinessPdf } from "@/lib/services/supplier-readiness-pdf";
import { requireUserKey } from "@/lib/middleware/auth";
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
  // 认证检查：诊断报告含企业敏感商业信息，必须登录后才可获取
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

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

    const companyName = String(row.company_name || "supplier").replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `国际公采能力诊断报告_${companyName}.pdf`;
    // RFC 5987: 中文文件名需要 URL 编码，HTTP header 不支持非 ASCII 字符
    const encodedFileName = encodeURIComponent(fileName);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // 同时提供 ASCII fallback 和 UTF-8 编码文件名
        "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodedFileName}`,
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
