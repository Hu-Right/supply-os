/**
 * GET /api/leads — 线索列表（需登录）
 * POST /api/leads — 创建线索（requireAuth，展厅注册除外）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey, requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { resolveMembershipState } from "@/lib/services/membership-status";
import { mapLeadForMemberView } from "@/lib/services/leads";
import type { Lead } from "@/types";

export const GET = withRoute(async (req: NextRequest) => {
  // VIP 门控（审查 F5，2026-08-30 产品决策）：线索属 CRM 客户数据，仅 VIP 会员可读；
  // 前端 useCrmData 对 403 已有置空兜底。
  // 隐私收口（越权修复）：F5 门控解决了"谁能看"，本映射解决"能看到什么"——
  // 线索联系人是提交表单的第三方个人，其姓名/联系方式与内部跟进记录不随视图下发。
  const auth = await requireUserKeyOrThrow(req);

  const ctx = getContext();
  const state = await resolveMembershipState(ctx.user.membershipRepo, auth.userId);
  if (!state.isVip) {
    routeError(403, 40041, "线索视图仅对 VIP 会员开放");
  }

  const rows = await ctx.leadsRepo.listAppointments();
  const leads = rows.map(mapLeadForMemberView);
  return NextResponse.json(leads);
});

export const POST = withRoute(async (req: NextRequest) => {
  const body = await req.json();
  const leadType = body?.type;

  // 展厅注册（exhibition_register）允许未登录用户提交
  let userId: number | undefined;
  if (leadType !== "exhibition_register") {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;
    userId = auth.userId;
  }

  const {
    companyName, country, city, contactPerson, contactMethod,
    email, industry, mainProducts, hasIntlProcurement, notes, type,
  } = body;

  if (!companyName || !contactPerson || !contactMethod) {
    routeError(400, 40022, "请填写必填字段");
  }

  const newLead: Lead = {
    id: `lead-user-${Date.now()}`,
    companyName,
    country: country || "China",
    city: city || "Unknown",
    contactPerson,
    contactMethod,
    email: email || "",
    industry: industry || "Other",
    mainProducts: mainProducts || "",
    hasIntlProcurement: !!hasIntlProcurement,
    notes: notes || "",
    type: type || "custom",
    status: "new",
    createdAt: new Date().toISOString(),
    followUpLogs: [{
      date: new Date().toISOString().substring(0, 16).replace("T", " "),
      content: `线索自动录入：来自门户前端表单申请，类型 ${type || "custom"}。`,
      author: "CRM System",
    }],
  };

  const ctx = getContext();
  await ctx.leadsRepo.insertAppointment({
    appointmentKey: newLead.id,
    companyName: newLead.companyName,
    country: newLead.country,
    city: newLead.city,
    contactPerson: newLead.contactPerson,
    contactMethod: newLead.contactMethod,
    email: newLead.email,
    industry: newLead.industry,
    consultationNeeds: newLead.notes,
    status: newLead.status,
    followUpLogs: JSON.stringify(newLead.followUpLogs || []),
    extra: JSON.stringify({ source: "portal", lead_type: type || "custom" }),
    rawPayload: JSON.stringify(body),
    ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "",
    createdAt: new Date(newLead.createdAt),
  });

  return NextResponse.json(newLead, { status: 201 });
});
