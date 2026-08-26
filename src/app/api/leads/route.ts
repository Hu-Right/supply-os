/**
 * GET /api/leads — 线索列表（admin）
 * POST /api/leads — 创建线索（requireAuth）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey, requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const rows = await getContext().leadsRepo.listAppointments();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;
  const body = await req.json();
  const result = await getContext().leadsRepo.insertAppointment({ ...body, user_key: auth.userKey });
  return NextResponse.json(result, { status: 201 });
}
