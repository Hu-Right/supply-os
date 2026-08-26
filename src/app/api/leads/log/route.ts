/** POST /api/leads/log — 跟进日志（admin） */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const body = await req.json();
  const { appointment_key, log_text, status } = body as { appointment_key: string; log_text: string; status: string };
  await getContext().leadsRepo.updateFollowUpLogs(appointment_key, log_text, status);
  return NextResponse.json({ success: true });
}
