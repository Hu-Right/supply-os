/**
 * GET /api/leads — 线索列表（需登录）
 * POST /api/leads — 创建线索（requireAuth，展厅注册除外）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey, extractUserKey } from "@/lib/middleware/auth";
import type { AppointmentRow } from "@/lib/repos/leads.repo";
import type { Lead } from "@/types";

/** 将数据库 AppointmentRow（snake_case）转换为前端 Lead（camelCase） */
function toLead(row: AppointmentRow): Lead {
  let followUpLogs: Lead["followUpLogs"];
  if (row.follow_up_logs) {
    try {
      const parsed = JSON.parse(row.follow_up_logs);
      followUpLogs = Array.isArray(parsed) ? parsed : undefined;
    } catch {
      // 非 JSON 格式：整段作为单条日志
      followUpLogs = [{ date: new Date(row.created_at).toISOString(), content: row.follow_up_logs, author: "System" }];
    }
  }
  return {
    id: row.appointment_key,
    companyName: row.company_name || "",
    country: row.country || "",
    city: row.city || "",
    contactPerson: row.contact_person || "",
    contactMethod: row.contact_method || "",
    email: row.email || "",
    industry: row.industry || "",
    mainProducts: "",
    hasIntlProcurement: false,
    notes: row.consultation_needs || "",
    type: "custom",
    status: (row.status as Lead["status"]) || "new",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    followUpLogs,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;
  const rows = await getContext().leadsRepo.listAppointments();
  const leads = rows.map(toLead);
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const leadType = body?.type;

  // 展厅注册（exhibition_register）允许未登录用户提交
  if (leadType === "exhibition_register") {
    const authResult = await extractUserKey(req);
    const result = await getContext().leadsRepo.insertAppointment({
      ...body,
      user_key: authResult.userKey || "anonymous",
    });
    return NextResponse.json(result, { status: 201 });
  }

  // 其他类型线索需要登录
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;
  const result = await getContext().leadsRepo.insertAppointment({ ...body, user_key: auth.userKey });
  return NextResponse.json(result, { status: 201 });
}
