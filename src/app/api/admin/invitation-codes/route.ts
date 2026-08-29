/**
 * /api/admin/invitation-codes — 员工与邀请码管理
 *
 * GET    — 列出所有员工（含邀请码）
 * POST   — 设置员工月度KPI目标（参数：employee_id, month, kpi_personal, kpi_enterprise）
 *
 * @module app/api/admin/invitation-codes/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const ctx = getContext();
  try {
    const employees = await ctx.user.invitationRepo.listAllEmployees();
    return NextResponse.json({ success: true, employees });
  } catch (err: unknown) {
    const msg = (err as Error).message || "查询失败";
    return NextResponse.json({ code: 50000, message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { employee_id, month, kpi_personal, kpi_enterprise } = await req.json();
  if (!employee_id || !month) {
    return NextResponse.json({ code: 40001, message: "缺少 employee_id 或 month 参数" }, { status: 400 });
  }

  const ctx = getContext();
  try {
    await ctx.user.invitationRepo.setMonthlyTarget(
      Number(employee_id),
      String(month),
      Number(kpi_personal ?? 0),
      Number(kpi_enterprise ?? 0),
    );
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    const msg = (err as Error).message || "设置失败";
    return NextResponse.json({ code: 50000, message: msg }, { status: 500 });
  }
}
