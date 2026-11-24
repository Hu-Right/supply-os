/**
 * GET /api/suppliers/stats — 供应商统计（公开）
 *
 * 出口只列举实际有消费方的四个计数键（命名红线②）：
 *   - total / searchable：首页数字墙（总供应商数、可检索数）
 *   - verified / commodityMatched：供应商目录页统计带
 * 2026-11-24 裁剪：withCertification / international / registered 全站无消费方，
 * 已从 SQL 与响应中移除（少两次 SUM 扫描）；成功/降级两路键集合保持一致。
 * 键集合由 tests/unit/app/api/supplier-catalog-view.test.ts 钉住。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";

export const GET = withRoute(async () => {
  try {
    const ctx = getContext();
    const stats = await ctx.supplier.directoryRepo.getStats();

    return NextResponse.json({
      total: stats.total,
      searchable: stats.searchable,
      verified: stats.verified,
      commodityMatched: stats.commodityMatched,
    });
  } catch (err) {
    console.error("[suppliers/stats GET]", err);
    return NextResponse.json({
      total: 0,
      searchable: 0,
      verified: 0,
      commodityMatched: 0,
    });
  }
});
