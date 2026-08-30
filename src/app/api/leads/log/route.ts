/**
 * POST /api/leads/log — 跟进日志（需登录）
 *
 * 与 Express 版 server/routes/leads.routes.ts 的 POST /api/leads/log 对齐：
 * Body: { leadId, content, nextStatus? }
 * 行为：查找线索 → 追加日志条目 → 可选更新状态 → 返回更新后的 Lead
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";
import { resolveMembershipState } from "@/lib/services/membership-status";
import { safeJson } from "@/lib/utils/json";
import type { Lead } from "@/types";

/** 跟进状态白名单（审查 F5）：与 Lead 类型定义保持一致，防任意值篡改状态 */
const LEAD_STATUS_WHITELIST = new Set(["new", "contacted", "qualified", "lost"]);

function mapUngmAppointmentRow(row: Record<string, any>): Lead {
  return {
    id: row.appointment_key,
    companyName: row.company_name,
    country: row.country || "China",
    city: row.city || "Unknown",
    contactPerson: row.contact_person,
    contactMethod: row.contact_method,
    email: row.email || "",
    industry: row.industry || "Services",
    mainProducts: "",
    hasIntlProcurement: false,
    notes: row.consultation_needs || "",
    type: "consulting_advisor",
    status: row.status || "new",
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString(),
    followUpLogs: safeJson(row.follow_up_logs),
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const { leadId, content, nextStatus } = body as {
    leadId: string;
    content: string;
    nextStatus?: string;
  };

  if (!leadId || !content) {
    return NextResponse.json(
      { code: 40022, message: "缺少线索 ID 或内容" },
      { status: 400 },
    );
  }

  const ctx = getContext();

  // VIP 门控（审查 F5，2026-08-30 产品决策）：跟进记录会修改线索状态，
  // 与线索读取同权限（仅 VIP 会员）
  const state = await resolveMembershipState(ctx.user.membershipRepo, auth.userKey);
  if (!state.isVip) {
    return NextResponse.json(
      { code: 40041, message: "线索跟进仅对 VIP 会员开放" },
      { status: 403 },
    );
  }

  // 状态白名单 + 内容限长（审查 F5）：nextStatus 此前为任意字符串断言，
  // content 无上限可灌大 TEXT 列
  if (nextStatus !== undefined && !LEAD_STATUS_WHITELIST.has(String(nextStatus))) {
    return NextResponse.json(
      { code: 40000, message: "无效的跟进状态" },
      { status: 400 },
    );
  }
  const safeContent = String(content).trim().slice(0, 2000);
  const safeAuthor = String(body.author || auth.userKey || "Operator").trim().slice(0, 100);

  const row = await ctx.leadsRepo.findByKey(String(leadId).slice(0, 100));
  if (!row) {
    return NextResponse.json(
      { code: 40044, message: "线索不存在" },
      { status: 404 },
    );
  }

  const targetLead = mapUngmAppointmentRow(row);
  if (!targetLead.followUpLogs) {
    targetLead.followUpLogs = [];
  }

  // 追加日志条目（与 Express 版行为一致）
  targetLead.followUpLogs.push({
    date: new Date().toISOString().substring(0, 16).replace("T", " "),
    content: safeContent,
    author: safeAuthor,
  });

  if (nextStatus) {
    targetLead.status = nextStatus as Lead["status"];
  }

  // 持久化
  await ctx.leadsRepo.updateFollowUpLogs(
    String(leadId).slice(0, 100),
    JSON.stringify(targetLead.followUpLogs),
    targetLead.status,
  );

  return NextResponse.json(targetLead);
}
