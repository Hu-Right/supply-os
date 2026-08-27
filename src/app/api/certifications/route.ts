/**
 * GET /api/certifications — 认证资质列表（公开）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/server/db/context";

export async function GET() {
  const rows = await getContext().catalogRepo.listActiveCertifications();
  return NextResponse.json(rows);
}
