/**
 * GET /api/admin/metrics/amount-backfill — 金额回填进度（管理员）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const parseVersion = Number(req.nextUrl.searchParams.get("parse_version")) || 2;
  const ctx = getContext();
  const remaining = await ctx.admin.adminRepo.countAmountBackfillRemaining(parseVersion);
  return NextResponse.json({ remaining, parse_version: parseVersion });
}
