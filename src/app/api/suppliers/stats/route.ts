/**
 * GET /api/suppliers/stats — 供应商统计（公开）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET() {
  try {
    const ctx = getContext();
    const stats = await ctx.supplier.directoryRepo.getStats();

    // 注册供应商数（crm_suppliers 表）
    let registered = 0;
    try {
      const [rows] = await ctx.supplier.registrationRepo["pool"].query(
        "SELECT COUNT(*) as total FROM crm_suppliers",
      );
      registered = (rows as any[])[0]?.total ?? 0;
    } catch {
      // 静默降级
    }

    return NextResponse.json({
      ...stats,
      registered,
    });
  } catch (err) {
    console.error("[suppliers/stats GET]", err);
    return NextResponse.json({
      searchable: 0,
      withCertification: 0,
      international: 0,
      registered: 0,
    });
  }
}
