/**
 * POST /api/supplier-qualification — 统一供应商评估提交
 *
 * 三个入口共用：
 *   - 资质测试独立页（source=qualification，默认）
 *   - 企业注册弹窗（source=registration，携带 user_key + referral_employee_id）
 *   - 扫码诊断独立页（source=diagnosis）
 *
 * 所有数据统一写入 crm_supplier_qualification 表。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getContext } from "@/lib/db/context";
import { SupplierQualificationRepo } from "@/lib/repos/supplier-qualification.repo";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";

export async function POST(req: NextRequest) {
  // 公开端点限流（审查 F33）：防垃圾数据灌库
  const rl = checkRateLimit(req, { windowMs: 10 * 60_000, maxAttempts: 10 },
    (r) => `sq:${extractClientIp(r)}`);
  if (rl) return rl;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 40000, message: "请求数据格式错误" }, { status: 400 });
  }

  // 必填校验（company_website 为选填，与前端 QualificationFormFields 保持一致）
  const required: [string, string][] = [
    ["company_name", "企业名称"],
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
  const ip = extractClientIp(req);
  const repo = new SupplierQualificationRepo(getPool());

  // ── 可选参数：关联用户、推荐员工、来源 ──
  const source = typeof body.source === "string" ? body.source : "qualification";
  let userId: number | null = null;
  let referralEmployeeId: number | null = null;

  // 通过 user_key（手机号）查找用户 ID
  if (body.user_key) {
    try {
      const ctx = getContext();
      const user = await ctx.user.usersRepo.findByPhone(String(body.user_key).trim());
      if (user) userId = user.id;
    } catch {
      // 查找失败不阻断提交
    }
  }

  // 推荐员工 ID（KPI 归属）：仅接受邀请码解析。不再直接信任请求体中的
  // referral_employee_id——未认证请求可借此为任意员工伪造 KPI 归因（审查 F33）
  if (body.invitation_code) {
    try {
      const ctx = getContext();
      const record = await ctx.user.invitationRepo.findByCode(String(body.invitation_code).trim().toUpperCase());
      if (record) referralEmployeeId = record.employee_id;
    } catch {
      // 解析失败不阻断提交
    }
  }

  try {
    const id = await repo.insertQualification({
      company_name: String(body.company_name).trim(),
      company_website: String(body.company_website || "").trim(),
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
      user_id: userId,
      referral_employee_id: referralEmployeeId,
      source,
    });

    // 自动回写：当 user_key 已解析到用户时，将 qualification_id 关联到 crm_users
    if (userId) {
      try {
        await repo.linkUserQualification(userId, id);
      } catch {
        // 回写失败不阻断提交
      }
    }

    return NextResponse.json({ success: true, id, qualification_id: id, message: "提交成功，我们将尽快审核" }, { status: 201 });
  } catch (err) {
    console.error("[supplier-qualification]", err);
    return NextResponse.json({ code: 50000, message: "提交失败" }, { status: 500 });
  }
}
