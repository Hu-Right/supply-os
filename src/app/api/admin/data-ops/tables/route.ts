/**
 * GET /api/admin/data-ops/tables — 数据库表信息（管理员）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireAdmin } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const ctx = getContext();
  const adminRepo = ctx.admin.adminRepo;
  const tables = await adminRepo.listExistingTables(["crm_bid_notices", "supplier", "users"]);
  const tableList = Array.from(tables) as string[];
  const rowCounts: Record<string, number> = {};
  for (const t of tableList) {
    rowCounts[t] = await adminRepo.countTableRows(t);
  }
  return NextResponse.json({ tables: tableList, row_counts: rowCounts });
}
