/**
 * GET /api/rfq/my-quotes — 当前供应商的报价列表
 *
 * @module app/api/rfq/my-quotes/route
 * @description 需登录。返回本人对多条 RFQ 的全部有效报价（含对应需求标题/状态/中标结果）。
 *              返回裸 { items, total }（与 /api/rfq/my 同风格）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { listMyQuotes } from "@/lib/services/rfq-quotes";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const pool = getPool();
  const items = await listMyQuotes(pool, auth.userId);
  return NextResponse.json({ items, total: items.length });
});
