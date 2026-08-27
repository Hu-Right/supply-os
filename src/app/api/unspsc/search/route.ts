/**
 * GET /api/unspsc/search — UNSPSC 类目搜索
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/server/db/context";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) return NextResponse.json([]);
  const rows = await getContext().catalogRepo.searchUnspsc(q);
  return NextResponse.json(rows);
}
