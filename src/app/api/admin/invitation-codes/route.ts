/**
 * /api/admin/invitation-codes — 邀请码管理
 *
 * GET  — 列出所有邀请码（含员工信息、使用统计）
 * POST — 创建新邀请码（参数：employee_id, max_uses?, expires_at?）
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
    const codes = await ctx.user.invitationRepo.listAllWithEmployee();
    return NextResponse.json({ success: true, codes });
  } catch (err: unknown) {
    const msg = (err as Error).message || "查询失败";
    return NextResponse.json({ code: 50000, message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { employee_id, max_uses, expires_at } = await req.json();
  if (!employee_id) {
    return NextResponse.json({ code: 40001, message: "缺少 employee_id 参数" }, { status: 400 });
  }

  const ctx = getContext();
  try {
    const code = await ctx.user.invitationRepo.create({
      employee_id: Number(employee_id),
      max_uses: max_uses != null ? Number(max_uses) : undefined,
      expires_at: expires_at ? new Date(expires_at) : undefined,
    });
    return NextResponse.json({ success: true, code }, { status: 201 });
  } catch (err: unknown) {
    const msg = (err as Error).message || "创建失败";
    return NextResponse.json({ code: 50000, message: msg }, { status: 500 });
  }
}
