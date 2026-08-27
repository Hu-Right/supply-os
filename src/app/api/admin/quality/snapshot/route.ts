/**
 * GET /api/admin/quality/snapshot — 质量快照（管理员）
 *
 * @module app/api/admin/quality/snapshot/route
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const days = Number(req.nextUrl.searchParams.get("days")) || 30;
  const ctx = getContext();
  const adminRepo = ctx.admin.adminRepo;
  const snapshots = await adminRepo.listQualitySnapshots(days);
  return NextResponse.json(snapshots);
}
