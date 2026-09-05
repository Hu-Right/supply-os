/**
 * 商机域路由 — 列表查询
 *
 * @module app/api/opportunities/route
 * @description 子路径端点（unlocks/translation/view/unlock）已拆分到各自独立的 route.ts。
 *              保留 /api/opportunities GET（按 UNSPSC code 查询商机列表）。
 *
 *              ARCH-P0（2026-09-05）：安全修复——
 *              1. 添加认证要求（此前无认证即可拉取全量数据）
 *              2. 截断 description 至 300 字符（与公告搜索列表对齐）
 *              3. 移除 source_url（付费内容，仅在解锁后的详情端点返回）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { normalizeUnspscCodes } from "@/lib/services/unspsc/parser";

/** description 截断阈值（与公告搜索列表 300 字符对齐） */
const LIST_DESC_MAX_CHARS = 300;

// ── GET /api/opportunities — 商机列表（按 UNSPSC code，需认证）──
export const GET = withRoute(
  async (req: NextRequest) => {
    await requireUserKeyOrThrow(req);

    const url = req.nextUrl;
    const ctx = getContext();
    const oppsRepo = ctx.opportunitiesRepo;
    const codeId = Number(url.searchParams.get("code_id") || url.searchParams.get("industry_id") || 0);
    if (codeId) {
      const items = await oppsRepo.listOpportunities(codeId);
      return NextResponse.json(
        items.map((row) => ({
          ...row,
          // ARCH-P0：截断全文 + 移除外部链接，付费内容仅在解锁后详情端点返回
          description: row.description && row.description.length > LIST_DESC_MAX_CHARS
            ? row.description.slice(0, LIST_DESC_MAX_CHARS) + "…"
            : row.description,
          source_url: undefined,
          unspsc_codes: normalizeUnspscCodes(row.unspsc_codes),
        })),
      );
    }
    return NextResponse.json({ code: 40404, message: "请提供 code_id 或 industry_id" }, { status: 404 });
  },
);
