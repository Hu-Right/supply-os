/**
 * 商机域路由 — 列表查询
 *
 * @module app/api/opportunities/route
 * @description 子路径端点（unlocks/translation/view/unlock）已拆分到各自独立的 route.ts。
 *              保留 /api/opportunities GET（按 UNSPSC code 查询商机列表）。
 *              P1 越权修复：本端点曾无认证返回完整 description + source_url，
 *              可绕过统一搜索的付费脱敏口径（core_locked 截断）。现已要求登录，
 *              且 description 截断至 300 字、source_url 置空，与列表口径对齐。
 *              未解锁详情仍需走 /api/opportunities/[id]/unlock 链路。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { normalizeUnspscCodes } from "@/lib/services/unspsc/parser";

/** 与统一搜索列表一致的摘要截断长度 */
const LIST_DESCRIPTION_MAX = 300;

// ── GET /api/opportunities — 商机列表（按 UNSPSC code，需登录，脱敏口径）──
export async function GET(req: NextRequest) {
  const auth = await requireUserKeyOrThrow(req);
  if (!auth.userId) {
    return NextResponse.json({ code: 40042, message: "请先登录" }, { status: 401 });
  }

  const url = req.nextUrl;
  const ctx = getContext();
  const oppsRepo = ctx.opportunitiesRepo;
  const codeId = Number(url.searchParams.get("code_id") || url.searchParams.get("industry_id") || 0);
  if (codeId) {
    const items = await oppsRepo.listOpportunities(codeId);
    return NextResponse.json(
      items.map((row) => ({
        ...row,
        description: String(row.description || "").slice(0, LIST_DESCRIPTION_MAX),
        source_url: null,
        unspsc_codes: normalizeUnspscCodes(row.unspsc_codes),
      })),
    );
  }
  return NextResponse.json({ code: 40404, message: "请提供 code_id 或 industry_id" }, { status: 404 });
}
