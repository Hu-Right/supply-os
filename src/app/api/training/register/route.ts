/**
 * POST /api/training/register — 培训报名
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ctx = getContext();
  const result = await ctx.trainingRepo.insertRegistration(body);
  return NextResponse.json({ success: true, id: result }, { status: 201 });
}
