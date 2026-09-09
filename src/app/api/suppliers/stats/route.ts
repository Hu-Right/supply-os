/**
 * GET /api/suppliers/stats — 供应商统计（公开）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET() {
  try {
    const ctx = getContext();
    const stats = await ctx.supplier.directoryRepo.getStats();
    const registered = await ctx.supplier.registrationRepo.countAll();

    return NextResponse.json({
      ...stats,
      registered,
    });
  } catch (err) {
    console.error("[suppliers/stats GET]", err);
    return NextResponse.json({
      searchable: 0,
      verified: 0,
      withCertification: 0,
      international: 0,
      registered: 0,
    });
  }
}
