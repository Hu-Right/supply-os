/**
 * GET /api/rfq/demands/mine — 我的采购需求（工作台列表）
 *
 * @module app/api/rfq/demands/mine/route
 * @description v2 读模型：直接读 `rfq_demand`，状态为 7 态体系（含 submitted/under_review/evaluation）。
 *              报价计数取 `rfq_quote`（新表）；旧表 `rfq_quotes` 在 P2 迁移后退役。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { clampLimit, DEFAULT_PAGE_LIMIT } from "@/shared/constants/api";
import { DEMAND_USER_FILTERABLE_STATUSES } from "@/shared/constants/rfq-demand";
import { toListItemDTO, type DemandRowLike } from "@/lib/services/rfq/dto";
import type { RowDataPacket } from "mysql2/promise";

interface DemandListRow extends RowDataPacket, DemandRowLike {
  quote_count: number;
  quote_pending: number;
}

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const pool = getPool();

  const sp = req.nextUrl.searchParams;
  const status = String(sp.get("status") || "").trim();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = clampLimit(sp.get("page_size"), DEFAULT_PAGE_LIMIT, 48);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ["d.buyer_user_id = ?"];
  const params: unknown[] = [auth.userId];
  if ((DEMAND_USER_FILTERABLE_STATUSES as readonly string[]).includes(status)) {
    conditions.push("d.status = ?");
    params.push(status);
  }
  const where = conditions.join(" AND ");

  const [countRes, dataRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM rfq_demand d WHERE ${where}`, params),
    pool.query(
      `SELECT d.*,
              (SELECT COUNT(*) FROM rfq_quote q WHERE q.demand_id = d.id AND q.status <> 'withdrawn' AND q.is_current = 1) AS quote_count,
              (SELECT COUNT(*) FROM rfq_quote q2 WHERE q2.demand_id = d.id AND q2.status = 'submitted' AND q2.is_current = 1) AS quote_pending
         FROM rfq_demand d
        WHERE ${where}
        ORDER BY d.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ),
  ]);

  const total = Number((countRes[0] as RowDataPacket[])[0]?.total || 0);
  const rows = dataRes[0] as DemandListRow[];

  return NextResponse.json({
    items: rows.map((r) =>
      toListItemDTO(r, { quoteCount: r.quote_count, quotePending: r.quote_pending }),
    ),
    total,
    page,
    page_size: pageSize,
  });
});
