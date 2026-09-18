/**
 * GET /api/unspsc/children — UNSPSC 子分类（按 parent_id）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const parentId = Number(req.nextUrl.searchParams.get("parent_id") || 0);
  if (!parentId) {
    routeError(400, EC_INVALID_PARAMS, "请提供分类 ID");
  }
  const catalogRepo = getContext().catalogRepo;

  const rows = await catalogRepo.listUnspsc(
    "SELECT id, title_zh, title, code, parent_id, level FROM crm_unspsc_codes WHERE parent_id = ? ORDER BY code",
    [parentId],
  );

  return NextResponse.json(rows);
});
