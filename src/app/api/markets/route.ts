/**
 * GET /api/markets — 目标市场字典（公开）
 *
 * @module app/api/markets/route
 * @description 诊断表单「计划投标的目标市场」的选项源（market_scope 表）。
 *              公开只读，HTTP 缓存 10 分钟；表为空时返回空数组，前端回退常量。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { withRoute } from "@/lib/middleware/route-handler";
import { MarketScopeRepo } from "@/lib/repos/market-scope.repo";

export const GET = withRoute(async () => {
  const scopes = await new MarketScopeRepo(getPool()).listActive();
  return NextResponse.json(
    scopes.map((s) => ({ code: s.code, label: s.labelZh })),
    { headers: { "Cache-Control": "public, max-age=600" } },
  );
});
