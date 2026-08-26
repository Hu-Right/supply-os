/**
 * GET /api/membership/plans — 套餐列表（公开）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET() {
  const rows = await getContext().user.membershipRepo.findActivePlans();
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
