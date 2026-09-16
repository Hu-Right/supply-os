/**
 * GET /api/certifications — 认证资质列表（公开）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  const rows = await getContext().catalogRepo.listActiveCertifications();
  return NextResponse.json(rows);
});
