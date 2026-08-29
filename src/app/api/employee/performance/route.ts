/**
 * GET /api/employee/performance?employee_id=1[&month=2026-09] — 员工业绩概览
 *
 * 参数：employee_id (必填), month (可选，默认当月)
 * 返回：员工信息 + 月度KPI目标 + 实际完成 + 完成率 + 最近注册用户列表
 * 认证：需登录
 *
 * @module app/api/employee/performance/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const employeeId = Number(req.nextUrl.searchParams.get("employee_id"));
  if (!employeeId || Number.isNaN(employeeId)) {
    return NextResponse.json({ code: 40001, message: "缺少 employee_id 参数" }, { status: 400 });
  }

  const month = req.nextUrl.searchParams.get("month") || undefined;

  const ctx = getContext();
  try {
    const perf = await ctx.user.invitationRepo.getEmployeePerformance(employeeId, month);
    return NextResponse.json({ success: true, ...perf });
  } catch (err: unknown) {
    const msg = (err as Error).message || "查询失败";
    return NextResponse.json({ code: 50000, message: msg }, { status: 500 });
  }
}
