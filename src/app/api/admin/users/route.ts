/**
 * GET /api/admin/users — 用户列表（管理员）
 *
 * @module app/api/admin/users/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);
  const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;
  const ctx = getContext();

  try {
    const [rows] = await ctx.dbPool.query(
      "SELECT id, email, phone, name, role, is_active, created_at, updated_at FROM users ORDER BY id DESC LIMIT ? OFFSET ?",
      [limit, offset],
    );
    const [countResult] = await ctx.dbPool.query("SELECT COUNT(*) as total FROM users");
    const total = (countResult as any)[0]?.total || 0;
    return NextResponse.json({ users: rows, total, limit, offset });
  } catch (err) {
    console.error("[admin/users]", err);
    return NextResponse.json({ code: 50000, message: "查询失败" }, { status: 500 });
  }
}
