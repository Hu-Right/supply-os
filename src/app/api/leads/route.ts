/**
 * GET /api/leads — 线索列表（admin）
 * POST /api/leads — 创建线索（requireAuth，展厅注册除外）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey, requireAdmin, extractUserKey } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const rows = await getContext().leadsRepo.listAppointments();
  return NextResponse.json(rows);
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
