/**
 * GET /api/employee/performance — 员工业绩概览
 *
 * 参数：employee_id (必填)
 * 返回：员工信息 + 总推荐数 + 本月推荐数 + 最近注册用户列表
 * 认证：需管理员权限
 *
 * @module app/api/employee/performance/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const employeeId = Number(req.nextUrl.searchParams.get("employee_id"));
  if (!employeeId || Number.isNaN(employeeId)) {
    return NextResponse.json({ code: 40001, message: "缺少 employee_id 参数" }, { status: 400 });
  }

  const ctx = getContext();
  try {
    const perf = await ctx.user.invitationRepo.getEmployeePerformance(employeeId);
    return NextResponse.json({ success: true, ...perf });
  } catch (err: unknown) {
    const msg = (err as Error).message || "查询失败";
    return NextResponse.json({ code: 50000, message: msg }, { status: 500 });
  }
}
