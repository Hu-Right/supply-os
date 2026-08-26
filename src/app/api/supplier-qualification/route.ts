/**
 * POST /api/supplier-qualification — 提交国际招投标能力初筛（公开+限流）
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { SupplierQualificationRepo } from "@/lib/repos/supplier-qualification.repo";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 40000, message: "Invalid JSON" }, { status: 400 });
  }

  // 必填校验
  const required: [string, string][] = [
    ["company_name", "企业名称"], ["company_website", "企业官网网址"],
    ["industry", "企业所属行业"], ["main_product", "企业主营产品"],
    ["export_scale", "出口/国际业务规模"], ["certifications", "资质证书"],
    ["service_countries", "售后点/服务站/维修点"], ["overseas_companies", "海外分公司/投资公司"],
    ["ungm_status", "UNGM注册状态"], ["english_team", "英文团队能力"],
    ["payment_terms", "账期接受度"], ["bid_willingness", "投标意愿"],
  ];
  for (const [field, label] of required) {
    const val = body[field];
    if (!val || (Array.isArray(val) && val.length === 0)) {
      return NextResponse.json({ code: 40000, message: `${label}为必填项` }, { status: 400 });
    }
  }

  const toArray = (v: unknown) => Array.isArray(v) ? v.join(", ") : String(v || "");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const repo = new SupplierQualificationRepo(getPool());

  try {
    const id = await repo.insertQualification({
      company_name: String(body.company_name).trim(),
      company_website: String(body.company_website).trim(),
      founding_year: String(body.founding_year || "").trim() || null,
      employee_count: String(body.employee_count || "").trim() || null,
      industry: toArray(body.industry),
      other_industry: String(body.other_industry || "").trim() || null,
      main_product: String(body.main_product).trim(),
      export_scale: String(body.export_scale).trim(),
      certifications: toArray(body.certifications),
      other_certifications: String(body.other_certifications || "").trim() || null,
      service_countries: String(body.service_countries).trim(),
      overseas_companies: String(body.overseas_companies).trim(),
      ungm_status: String(body.ungm_status).trim(),
      english_team: String(body.english_team).trim(),
      payment_terms: String(body.payment_terms).trim(),
      bid_willingness: String(body.bid_willingness).trim(),
      contact_info: String(body.contact_info || "").trim() || null,
      ip,
    });
    return NextResponse.json({ success: true, id, message: "提交成功，我们将尽快审核" }, { status: 201 });
  } catch (err) {
    console.error("[supplier-qualification]", err);
    return NextResponse.json({ code: 50000, message: "提交失败" }, { status: 500 });
  }
}
