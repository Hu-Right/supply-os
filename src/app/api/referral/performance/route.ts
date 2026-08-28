/**
 * GET /api/referral/performance?code=EMP-XXXXXXXX — 员工推荐业绩查询
 *
 * 员工输入自己的邀请码即可查看业绩（无需登录）。
 * 邀请码本身即为凭证，不暴露敏感信息。
 *
 * @module app/api/referral/performance/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ code: 40001, message: "缺少邀请码参数 code" }, { status: 400 });
  }

  const ctx = getContext();
  try {
    // 通过邀请码查找关联员工
    const record = await ctx.user.invitationRepo.findByCode(code);
    if (!record) {
      return NextResponse.json({ code: 40031, message: "邀请码不存在" }, { status: 404 });
    }

    // 查询该员工的推荐业绩
    const perf = await ctx.user.invitationRepo.getEmployeePerformance(record.employee_id);

    return NextResponse.json({
      success: true,
      invitation_code: record.code,
      referral_link: `${req.nextUrl.origin}/r/${record.code}`,
      ...perf,
    });
  } catch (err: unknown) {
    const msg = (err as Error).message || "查询失败";
    return NextResponse.json({ code: 50000, message: msg }, { status: 500 });
  }
}
