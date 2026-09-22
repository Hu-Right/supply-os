/**
 * GET /api/unspsc/industries — UNSPSC 一级行业分类（10min 缓存）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  const catalogRepo = getContext().catalogRepo;

  const rows = await catalogRepo.listUnspsc(
    "SELECT id, title_zh, title, code, parent_id, level FROM crm_unspsc_codes WHERE level = 1 ORDER BY id",
    [],
  );

  return NextResponse.json(rows, { headers: { "Cache-Control": "public, max-age=600" } });
});
