/**
 * GET /api/unspsc/smart-infer — 智能推断 UNSPSC 类目
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 1) return NextResponse.json({ result: null, candidates: [] });
  const { best, candidates } = await getContext().catalogRepo.smartInferUnspsc(q);
  return NextResponse.json({ result: best, candidates });
});
