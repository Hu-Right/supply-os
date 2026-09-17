/**
 * GET /api/user/enterprise — 当前登录用户的企业信息（企业表 crm_suppliers）
 *
 * @module app/api/user/enterprise/route
 * @description 依据 crm_users.supplier_id 关联 crm_suppliers（企业注册表），
 *              返回该企业展示字段。未绑定或企业记录不存在时 bound=false。
 *              仅返回展示所需字段，不泄露联系方式明文以外的敏感列。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";

/** crm_suppliers 行 → 前端企业信息 DTO */
function mapEnterprise(row: any) {
  return {
    id: Number(row.id),
    companyName: String(row.company_name || ""),
    enterpriseNature: String(row.enterprise_nature || ""),
    supplierGrade: String(row.supplier_grade || ""),
    industry: String(row.industry || ""),
    mainProduct: String(row.main_product || ""),
    certification: String(row.certification || ""),
    exportExperience: String(row.export_experience || ""),
    country: String(row.country || ""),
    dataQualityScore: row.data_quality_score != null ? Number(row.data_quality_score) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    registrationCount: Number(row.registration_count || 0),
    isPaid: Number(row.is_paid || 0) === 1,
  };
}

export const GET = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();

  const user = await ctx.user.usersRepo.findProfileById(auth.userId);
  const supplierId = user?.supplier_id ? Number(user.supplier_id) : 0;
  const linkStatus = String(user?.supplier_link_status || "none");

  if (!supplierId) {
    return NextResponse.json({ code: 0, message: "ok", data: { bound: false, linkStatus, enterprise: null } });
  }

  const row = await ctx.supplier.registrationRepo.findCrmById(supplierId);
  if (!row) {
    return NextResponse.json({ code: 0, message: "ok", data: { bound: false, linkStatus, enterprise: null } });
  }

  return NextResponse.json({ code: 0, message: "ok", data: { bound: true, linkStatus, enterprise: mapEnterprise(row) } });
});
