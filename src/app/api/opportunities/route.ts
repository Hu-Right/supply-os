/**
 * 商机域路由 — 列表查询
 *
 * @module app/api/opportunities/route
 * @description 子路径端点（unlocks/translation/view/unlock）已拆分到各自独立的 route.ts。
 *              保留 /api/opportunities GET（按 UNSPSC code 查询商机列表）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { normalizeUnspscCodes } from "@/lib/services/unspsc/parser";

// ── GET /api/opportunities — 商机列表（按 UNSPSC code）──
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const ctx = getContext();
  const oppsRepo = ctx.opportunitiesRepo;
  const codeId = Number(url.searchParams.get("code_id") || url.searchParams.get("industry_id") || 0);
  if (codeId) {
    const items = await oppsRepo.listOpportunities(codeId);
    return NextResponse.json(
      items.map((row) => ({
        ...row,
        unspsc_codes: normalizeUnspscCodes(row.unspsc_codes),
      })),
    );
  }
  return NextResponse.json({ code: 40404, message: "请提供 code_id 或 industry_id" }, { status: 404 });
}
