/**
 * GET /api/rfq/my-quotes — 当前供应商的报价列表
 *
 * @module app/api/rfq/my-quotes/route
 * @description 需登录。返回本人对多条 RFQ 的全部有效报价（含对应需求标题/状态/中标结果）。
 *              返回裸 { items, total }（与 /api/rfq/demands/mine 同风格）。
 *
 *              过渡期桥接：报价表 `rfq_quotes.rfq_id` 仍指向搜索投影行（bid_notices.id），
 *              而门户详情页按 `rfq_demand.id` 路由。这里补一次 `notice_pk → demand_id` 映射，
 *              让列表能正确跳转；P2 报价迁到 `demand_id` 后可删。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { listMyQuotes } from "@/lib/services/rfq-quotes";
import type { RowDataPacket } from "mysql2/promise";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const pool = getPool();
  const items = await listMyQuotes(pool, auth.userId);

  const noticePks = [...new Set(items.map((i) => Number(i.rfqId)).filter((n) => Number.isFinite(n) && n > 0))];
  let mapping = new Map<number, number>();
  if (noticePks.length > 0) {
    const placeholders = noticePks.map(() => "?").join(", ");
    const [rows] = await pool.query(
      `SELECT id, notice_pk FROM rfq_demand WHERE notice_pk IN (${placeholders})`,
      noticePks,
    );
    mapping = new Map(
      (rows as RowDataPacket[]).map((r) => [Number(r.notice_pk), Number(r.id)]),
    );
  }

  return NextResponse.json({
    items: items.map((i) => ({
      ...i,
      /** 门户详情页路由用；找不到映射时退回投影 id（历史数据） */
      demandId: mapping.get(Number(i.rfqId)) ?? null,
    })),
    total: items.length,
  });
});
