/**
 * GET /api/suppliers/stats — 供应商统计（公开）
 *
 * 两个出口都显式列举六个计数键（命名红线②）：以前成功分支写的是 `json({ ...stats, registered })`，
 * 仓储改一条 COUNT 或加一个内部诊断字段就会直接变成对外契约；而降级分支早就硬编了六键，
 * 两路形状仅靠人肉眼对齐。现在键集合由 `tests/unit/app/api/supplier-catalog-view.test.ts` 钉住。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  try {
    const ctx = getContext();
    const stats = await ctx.supplier.directoryRepo.getStats();
    const registered = await ctx.supplier.directoryRepo.countApproved();

    return NextResponse.json({
      searchable: stats.searchable,
      verified: stats.verified,
      withCertification: stats.withCertification,
      international: stats.international,
      commodityMatched: stats.commodityMatched,
      registered,
    });
  } catch (err) {
    console.error("[suppliers/stats GET]", err);
    return NextResponse.json({
      searchable: 0,
      verified: 0,
      withCertification: 0,
      international: 0,
      registered: 0,
      commodityMatched: 0,
    });
  }
});
